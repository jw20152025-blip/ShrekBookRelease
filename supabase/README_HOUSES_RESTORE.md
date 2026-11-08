# ShrekBook Houses restoration

The House API and interface are updated to use the current Supabase schema.

- houses.house_type_id references house_types.id.
- house_rooms uses owner_id and is_private for private bedrooms.
- House creation and upgrades are transactional PostgreSQL functions.
- House messages are stored in house_messages and served through authenticated API routes.
- Marketplace purchases apply the highest tax reduction from a House the buyer owns or belongs to.
- House table RLS is enabled with member/private-room-aware read policies. The Node server continues to use the service-role key server-side; never expose that key in browser code.

## Apply the database migration

The repository migration is:
supabase/migrations/20261108000100_restore_houses.sql

1. Open the ShrekBook Supabase project.
2. Open SQL Editor and create a new query.
3. Open the migration file from this repository and copy its complete contents.
4. Paste the SQL into the editor and run it once.
5. Confirm the query completes successfully before deploying the matching Stable-Release code.

The migration is designed to preserve existing Houses, memberships, rooms, invitations, messages, media and call records. It adds private-room metadata, backfills missing owner-membership rows, installs atomic purchase/upgrade functions, updates marketplace tax calculation, and replaces House table policies.

Do not remove or recreate the existing House tables. No profile, authentication, post, inventory or currency data is dropped.

## Current House features in this release

- Browse the House directory and inspect House types.
- Purchase and create a House using ShrekCoins.
- Invite users, accept/decline invitations, and manage membership.
- Promote/demote admins and remove members.
- Edit House name and description.
- Create chat rooms and private rooms.
- Read and send persistent room messages.
- Upgrade a House to a higher tier; the function charges only the price difference and creates newly unlocked rooms.
- Apply House tax reductions to marketplace purchases.

Voice/video calling and media uploads are not exposed in this UI yet; the database tables are retained for a later implementation.
