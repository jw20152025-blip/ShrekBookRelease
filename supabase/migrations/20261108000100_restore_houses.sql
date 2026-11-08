-- ShrekBook Houses restoration
-- Preserves existing houses, memberships, rooms, invitations, messages and media.
-- Apply once to the linked Supabase project after reviewing the migration.

begin;

-- Private-room ownership is explicit. Existing rooms remain public by default.
alter table public.house_rooms
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists is_private boolean not null default false;

create index if not exists house_rooms_owner_id_idx
  on public.house_rooms(owner_id);

create index if not exists house_messages_room_created_idx
  on public.house_messages(room_id, created_at desc);

-- Every House owner is also represented as a member. Existing memberships
-- and their roles are retained.
insert into public.house_members(house_id, user_id, role)
select h.id, h.owner_id, 'owner'
from public.houses h
where not exists (
  select 1 from public.house_members m
  where m.house_id = h.id and m.user_id = h.owner_id
);

-- Internal authorization helpers. They only inspect the currently signed-in
-- user's membership and cannot be used to query another user's access.
create or replace function public.is_house_member(p_house_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.house_members m
    where m.house_id = p_house_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_house_room(p_room_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.house_rooms r
    join public.house_members m on m.house_id = r.house_id
    where r.id = p_room_id
      and m.user_id = (select auth.uid())
      and (
        not r.is_private
        or r.owner_id = (select auth.uid())
        or m.role in ('owner', 'admin')
      )
  );
$$;

revoke all on function public.is_house_member(bigint) from public, anon;
revoke all on function public.can_access_house_room(bigint) from public, anon;
grant execute on function public.is_house_member(bigint) to authenticated, service_role;
grant execute on function public.can_access_house_room(bigint) to authenticated, service_role;

-- House purchases run through this function so the coin debit, House,
-- owner membership, rooms and ledger entry commit or roll back together.
create or replace function public.create_house_purchase(
  p_owner_id uuid,
  p_name text,
  p_description text,
  p_house_type_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.house_types%rowtype;
  v_house public.houses%rowtype;
  v_balance bigint;
  v_index integer;
  v_room_count integer;
begin
  if p_owner_id is null then
    raise exception 'A valid owner is required';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(p_name)) > 50 then
    raise exception 'House name must be between 1 and 50 characters';
  end if;

  if length(coalesce(p_description, '')) > 300 then
    raise exception 'House description must be 300 characters or fewer';
  end if;

  select * into v_type
  from public.house_types
  where id = p_house_type_id;

  if not found then
    raise exception 'Invalid House type';
  end if;

  select shrekcoins into v_balance
  from public.profiles
  where id = p_owner_id
  for update;

  if not found then
    raise exception 'Owner profile not found';
  end if;

  if coalesce(v_balance, 0) < v_type.cost then
    raise exception 'You do not have enough ShrekCoins';
  end if;

  update public.profiles
  set shrekcoins = shrekcoins - v_type.cost
  where id = p_owner_id;

  insert into public.houses(name, description, owner_id, house_type_id)
  values (trim(p_name), coalesce(p_description, ''), p_owner_id, v_type.id)
  returning * into v_house;

  insert into public.house_members(house_id, user_id, role)
  values (v_house.id, p_owner_id, 'owner')
  on conflict (house_id, user_id) do nothing;

  v_room_count := greatest(1, v_type.room_count);
  for v_index in 1..v_room_count loop
    insert into public.house_rooms(
      house_id, name, room_type, description, position, owner_id, is_private
    )
    values (
      v_house.id,
      case
        when v_index = 1 then 'Main Hall'
        when v_index = v_room_count then 'Private Bedroom'
        else 'Room ' || v_index
      end,
      'chat',
      case when v_index = v_room_count then 'A private bedroom' else '' end,
      v_index - 1,
      case when v_index = v_room_count then p_owner_id else null end,
      v_index = v_room_count
    );
  end loop;

  if v_type.cost > 0 then
    insert into public.shrekcoin_transactions(user_id, amount, reason)
    values (p_owner_id, -v_type.cost, 'Purchased ' || v_type.name || ' House');
  end if;

  return jsonb_build_object(
    'id', v_house.id,
    'name', v_house.name,
    'description', v_house.description,
    'owner_id', v_house.owner_id,
    'house_type_id', v_house.house_type_id,
    'created_at', v_house.created_at
  );
end;
$$;

revoke all on function public.create_house_purchase(uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.create_house_purchase(uuid, text, text, bigint)
  to service_role;

-- House upgrades are also atomic: charge only the price difference and
-- create the newly unlocked rooms in the same transaction.
create or replace function public.upgrade_house_purchase(
  p_owner_id uuid,
  p_house_id bigint,
  p_target_house_type_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_house public.houses%rowtype;
  v_old_type public.house_types%rowtype;
  v_new_type public.house_types%rowtype;
  v_balance bigint;
  v_existing_rooms integer;
  v_index integer;
  v_cost bigint;
begin
  select * into v_house
  from public.houses
  where id = p_house_id
  for update;

  if not found or v_house.owner_id <> p_owner_id then
    raise exception 'Only the House owner can upgrade this House';
  end if;

  select * into v_old_type from public.house_types where id = v_house.house_type_id;
  select * into v_new_type from public.house_types where id = p_target_house_type_id;

  if not found or v_new_type.id is null then
    raise exception 'Invalid upgrade type';
  end if;

  if v_new_type.room_count <= v_old_type.room_count or v_new_type.cost <= v_old_type.cost then
    raise exception 'Choose a higher House type to upgrade';
  end if;

  v_cost := v_new_type.cost - v_old_type.cost;

  select shrekcoins into v_balance
  from public.profiles
  where id = p_owner_id
  for update;

  if not found then raise exception 'Owner profile not found'; end if;
  if coalesce(v_balance, 0) < v_cost then
    raise exception 'You do not have enough ShrekCoins for this upgrade';
  end if;

  update public.profiles set shrekcoins = shrekcoins - v_cost where id = p_owner_id;
  update public.houses set house_type_id = v_new_type.id, updated_at = now() where id = p_house_id;

  select count(*) into v_existing_rooms from public.house_rooms where house_id = p_house_id;
  if v_existing_rooms < v_new_type.room_count then
    for v_index in (v_existing_rooms + 1)..v_new_type.room_count loop
      insert into public.house_rooms(
        house_id, name, room_type, description, position, owner_id, is_private
      )
      values (
        p_house_id,
        'Room ' || v_index,
        'chat',
        '',
        v_index - 1,
        null,
        false
      );
    end loop;
  end if;

  if v_cost > 0 then
    insert into public.shrekcoin_transactions(user_id, amount, reason)
    values (p_owner_id, -v_cost, 'Upgraded House to ' || v_new_type.name);
  end if;

  select * into v_house from public.houses where id = p_house_id;
  return jsonb_build_object(
    'id', v_house.id,
    'name', v_house.name,
    'description', v_house.description,
    'owner_id', v_house.owner_id,
    'house_type_id', v_house.house_type_id,
    'created_at', v_house.created_at
  );
end;
$$;

revoke all on function public.upgrade_house_purchase(uuid, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.upgrade_house_purchase(uuid, bigint, bigint)
  to service_role;

-- Integrate the existing House type benefit with marketplace purchases.
-- tax_reduction is stored as a decimal fraction (0.0500 = 5%).
create or replace function public.purchase_shop_item(p_buyer_id uuid, p_item_id bigint)
returns table(
  item_price bigint,
  tax_amount bigint,
  seller_amount bigint,
  buyer_shrekcoins bigint,
  seller_id uuid
)
language plpgsql
as $function$
declare
  v_price bigint;
  v_seller_id uuid;
  v_buyer_balance bigint;
  v_tax_rate numeric := 0.125;
  v_house_reduction numeric := 0;
  v_tax bigint;
  v_seller_amount bigint;
begin
  select si.price, si.user_id
  into v_price, v_seller_id
  from public.shop_items si
  where si.id = p_item_id and si.active = true
  for update;

  if not found then raise exception 'This item is not currently for sale.'; end if;
  if v_seller_id is null then raise exception 'This item has no owner.'; end if;
  if v_seller_id = p_buyer_id then raise exception 'You cannot purchase your own item.'; end if;

  select p.shrekcoins into v_buyer_balance
  from public.profiles p
  where p.id = p_buyer_id
  for update;

  if not found then raise exception 'Buyer profile not found.'; end if;

  select coalesce(max(ht.tax_reduction), 0)
  into v_house_reduction
  from public.house_members hm
  join public.houses h on h.id = hm.house_id
  join public.house_types ht on ht.id = h.house_type_id
  where hm.user_id = p_buyer_id;

  -- A House owner is entitled to their House benefit even if an older
  -- record was missing its owner-membership row.
  select greatest(
    coalesce(v_house_reduction, 0),
    coalesce((
      select max(ht.tax_reduction)
      from public.houses h
      join public.house_types ht on ht.id = h.house_type_id
      where h.owner_id = p_buyer_id
    ), 0)
  ) into v_house_reduction;

  v_tax_rate := greatest(0, v_tax_rate - coalesce(v_house_reduction, 0));
  v_tax := floor(v_price * v_tax_rate)::bigint;
  v_seller_amount := v_price - v_tax;

  if v_buyer_balance < v_price then
    raise exception 'You do not have enough ShrekCoins.';
  end if;

  delete from public.user_shop_items
  where user_id = p_buyer_id and item_id = p_item_id;

  update public.profiles
  set shrekcoins = shrekcoins - v_price
  where id = p_buyer_id;

  update public.profiles
  set shrekcoins = shrekcoins + v_seller_amount
  where id = v_seller_id;

  update public.shop_items
  set active = false
  where id = p_item_id;

  insert into public.user_shop_items(user_id, item_id, purchased_at, equipped)
  values (p_buyer_id, p_item_id, now(), false);

  return query
  select v_price, v_tax, v_seller_amount, p.shrekcoins, v_seller_id
  from public.profiles p
  where p.id = p_buyer_id;
end;
$function$;

-- Replace any legacy House policies so permissive old policies cannot bypass
-- private-room checks. The application uses the server-side service role;
-- direct Data API access is read-only and membership-scoped.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'houses','house_types','house_members','house_rooms',
        'house_invitations','house_messages','house_media',
        'house_message_media','house_calls','house_call_participants',
        'house_call_signals'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

alter table public.houses enable row level security;
alter table public.house_types enable row level security;
alter table public.house_members enable row level security;
alter table public.house_rooms enable row level security;
alter table public.house_invitations enable row level security;
alter table public.house_messages enable row level security;
alter table public.house_media enable row level security;
alter table public.house_message_media enable row level security;
alter table public.house_calls enable row level security;
alter table public.house_call_participants enable row level security;
alter table public.house_call_signals enable row level security;

create policy "Authenticated users can read House directory"
  on public.houses for select to authenticated using (true);
create policy "Authenticated users can read House types"
  on public.house_types for select to authenticated using (true);
create policy "Users can read their House memberships"
  on public.house_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_house_member(house_id));
create policy "Members can read permitted House rooms"
  on public.house_rooms for select to authenticated
  using (public.can_access_house_room(id));
create policy "Users can read their House invitations"
  on public.house_invitations for select to authenticated
  using (invitee_id = (select auth.uid()) or inviter_id = (select auth.uid()));
create policy "Members can read permitted House messages"
  on public.house_messages for select to authenticated
  using (public.can_access_house_room(room_id));
create policy "Members can read permitted House media"
  on public.house_media for select to authenticated
  using (public.can_access_house_room(room_id));
create policy "Members can read permitted House message media"
  on public.house_message_media for select to authenticated
  using (public.can_access_house_room(room_id));
create policy "Members can read permitted House calls"
  on public.house_calls for select to authenticated
  using (public.can_access_house_room(room_id));
create policy "Members can read permitted House call participants"
  on public.house_call_participants for select to authenticated
  using (
    exists (
      select 1 from public.house_calls c
      where c.id = house_call_participants.call_id
        and public.can_access_house_room(c.room_id)
    )
  );
create policy "Call participants can read their signals"
  on public.house_call_signals for select to authenticated
  using (
    exists (
      select 1 from public.house_calls c
      where c.id = house_call_signals.call_id
        and public.can_access_house_room(c.room_id)
    )
  );

commit;
