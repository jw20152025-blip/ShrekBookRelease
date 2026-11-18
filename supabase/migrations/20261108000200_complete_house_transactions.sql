-- Make House invitations transactional and keep upgraded room positions stable.
begin;

create or replace function public.send_house_invitation(
  p_house_id bigint,
  p_inviter_id uuid,
  p_invitee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id bigint;
begin
  if p_inviter_id is null or p_invitee_id is null or p_house_id is null then
    raise exception 'House and both users are required';
  end if;
  if p_inviter_id = p_invitee_id then
    raise exception 'You cannot invite yourself';
  end if;

  perform 1 from public.houses where id = p_house_id for update;
  if not found then raise exception 'House not found'; end if;

  if not exists (
    select 1 from public.house_members
    where house_id = p_house_id
      and user_id = p_inviter_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only House managers can invite users';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception 'User not found';
  end if;

  if exists (
    select 1 from public.house_members
    where house_id = p_house_id and user_id = p_invitee_id
  ) then
    raise exception 'That user is already a member';
  end if;

  select id into v_invitation_id
  from public.house_invitations
  where house_id = p_house_id
    and invitee_id = p_invitee_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_invitation_id is null then
    insert into public.house_invitations(house_id, inviter_id, invitee_id, status)
    values (p_house_id, p_inviter_id, p_invitee_id, 'pending')
    returning id into v_invitation_id;
  else
    update public.house_invitations
    set inviter_id = p_inviter_id, created_at = now(), responded_at = null
    where id = v_invitation_id;
  end if;

  return jsonb_build_object('id', v_invitation_id, 'status', 'pending');
end;
$$;

create or replace function public.respond_house_invitation(
  p_invitation_id bigint,
  p_invitee_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.house_invitations%rowtype;
  v_status text;
begin
  if p_action not in ('accept', 'decline') then
    raise exception 'Invalid invitation action';
  end if;

  select * into v_invitation
  from public.house_invitations
  where id = p_invitation_id
    and invitee_id = p_invitee_id
    and status = 'pending'
  for update;

  if not found then raise exception 'Pending invitation not found'; end if;

  if p_action = 'accept' then
    insert into public.house_members(house_id, user_id, role)
    values (v_invitation.house_id, p_invitee_id, 'member')
    on conflict (house_id, user_id) do nothing;
    v_status := 'accepted';
  else
    v_status := 'declined';
  end if;

  update public.house_invitations
  set status = v_status, responded_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'success', true,
    'status', v_status,
    'house_id', v_invitation.house_id
  );
end;
$$;

revoke all on function public.send_house_invitation(bigint, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.respond_house_invitation(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.send_house_invitation(bigint, uuid, uuid)
  to service_role;
grant execute on function public.respond_house_invitation(bigint, uuid, text)
  to service_role;

-- Add exactly the missing number of rooms after the current highest position.
-- This remains correct even when rooms have been deleted and positions contain gaps.
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
  v_next_position integer;
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

  select count(*), coalesce(max(position), -1)
  into v_existing_rooms, v_next_position
  from public.house_rooms
  where house_id = p_house_id;

  if v_existing_rooms < v_new_type.room_count then
    for v_index in 1..(v_new_type.room_count - v_existing_rooms) loop
      v_next_position := v_next_position + 1;
      insert into public.house_rooms(
        house_id, name, room_type, description, position, owner_id, is_private
      )
      values (
        p_house_id,
        'Room ' || (v_next_position + 1),
        'chat',
        '',
        v_next_position,
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

commit;
