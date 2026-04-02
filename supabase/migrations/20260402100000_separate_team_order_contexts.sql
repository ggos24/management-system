-- Separate sidebar and schedule team orderings
-- Add context column to distinguish between views

alter table user_team_orders add column context varchar not null default 'sidebar';

-- Drop old unique constraint and create new one including context
alter table user_team_orders drop constraint user_team_orders_unique;
alter table user_team_orders add constraint user_team_orders_unique unique (user_id, team_id, context);

-- Recreate index with context
drop index if exists idx_user_team_orders_user;
create index idx_user_team_orders_user on user_team_orders(user_id, context, sort_order);

-- Duplicate existing rows as schedule orders so both views start identical
insert into user_team_orders (user_id, team_id, sort_order, context)
select user_id, team_id, sort_order, 'schedule'
from user_team_orders
where context = 'sidebar'
on conflict do nothing;
