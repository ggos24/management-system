-- Per-user team ordering (sidebar drag-and-drop)
create table if not exists user_team_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  sort_order int not null default 0,
  constraint user_team_orders_unique unique (user_id, team_id)
);

create index idx_user_team_orders_user on user_team_orders(user_id, sort_order);

alter table user_team_orders enable row level security;

-- Users can only read/write their own ordering
create policy "Users manage own team order" on user_team_orders
  for all to authenticated
  using (user_id = (select id from profiles where auth_user_id = auth.uid()))
  with check (user_id = (select id from profiles where auth_user_id = auth.uid()));
