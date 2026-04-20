-- Per-team hidden columns for the workspace table view.
-- Editor/Admin controls column visibility; everyone sees the same result.

create table if not exists team_hidden_columns (
  team_id uuid not null references teams(id) on delete cascade,
  column_key text not null,
  hidden_by uuid references profiles(id) on delete set null,
  hidden_at timestamptz not null default now(),
  primary key (team_id, column_key)
);

create index if not exists idx_team_hidden_columns_team on team_hidden_columns(team_id);

alter table team_hidden_columns enable row level security;

-- Anyone authenticated can read (so all users see the same hidden set)
create policy "Anyone can read team hidden columns"
  on team_hidden_columns
  for select
  to authenticated
  using (true);

-- Only admin/editor roles can write
create policy "Editors manage team_hidden_columns insert"
  on team_hidden_columns
  for insert
  to authenticated
  with check (is_editor());

create policy "Editors manage team_hidden_columns update"
  on team_hidden_columns
  for update
  to authenticated
  using (is_editor());

create policy "Editors manage team_hidden_columns delete"
  on team_hidden_columns
  for delete
  to authenticated
  using (is_editor());

-- Realtime
alter publication supabase_realtime add table team_hidden_columns;
