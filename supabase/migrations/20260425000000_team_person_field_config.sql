-- Per-team configuration for built-in person fields (Author / Editor / Designer).
-- Absence of a row = use defaults (label = "Author"/"Editor"/"Designer", hidden = false).

create table if not exists team_person_field_config (
  team_id uuid not null references teams(id) on delete cascade,
  field_key text not null check (field_key in ('author', 'editor', 'designer')),
  label text,
  hidden boolean not null default false,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, field_key)
);

create index if not exists idx_team_person_field_config_team on team_person_field_config(team_id);

alter table team_person_field_config enable row level security;

create policy "Anyone can read team_person_field_config"
  on team_person_field_config
  for select
  to authenticated
  using (true);

create policy "Editors manage team_person_field_config insert"
  on team_person_field_config
  for insert
  to authenticated
  with check (is_editor());

create policy "Editors manage team_person_field_config update"
  on team_person_field_config
  for update
  to authenticated
  using (is_editor());

create policy "Editors manage team_person_field_config delete"
  on team_person_field_config
  for delete
  to authenticated
  using (is_editor());

alter publication supabase_realtime add table team_person_field_config;

-- Seed: preserve the previous hardcoded Management label swap so existing UI doesn't change after migration.
insert into team_person_field_config (team_id, field_key, label)
select id, 'author', 'Executive' from teams where lower(name) like '%management%'
on conflict do nothing;

insert into team_person_field_config (team_id, field_key, label)
select id, 'editor', 'Manager' from teams where lower(name) like '%management%'
on conflict do nothing;
