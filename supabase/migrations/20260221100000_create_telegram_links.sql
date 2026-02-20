-- Create telegram_links table for Telegram bot integration
create table if not exists telegram_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  chat_id bigint,
  link_code text unique,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint telegram_links_profile_id_key unique (profile_id)
);

-- Indexes
create index idx_telegram_links_profile on telegram_links(profile_id);
create index idx_telegram_links_code on telegram_links(link_code) where link_code is not null;

-- Enable RLS
alter table telegram_links enable row level security;

-- RLS Policies
-- Users can read their own telegram link
create policy "Users can read own telegram link"
  on telegram_links for select
  using (profile_id in (
    select id from profiles where auth_user_id = auth.uid()
  ));

-- Authenticated users can insert their own telegram link
create policy "Users can insert own telegram link"
  on telegram_links for insert
  with check (
    auth.role() = 'authenticated'
    and profile_id in (
      select id from profiles where auth_user_id = auth.uid()
    )
  );

-- Users can update their own telegram link
create policy "Users can update own telegram link"
  on telegram_links for update
  using (profile_id in (
    select id from profiles where auth_user_id = auth.uid()
  ));

-- Users can delete their own telegram link
create policy "Users can delete own telegram link"
  on telegram_links for delete
  using (profile_id in (
    select id from profiles where auth_user_id = auth.uid()
  ));
