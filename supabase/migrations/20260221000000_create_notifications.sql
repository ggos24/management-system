-- Create notifications table
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null,
  message text not null,
  entity_data jsonb default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_notifications_recipient on notifications(recipient_id, created_at desc);
create index idx_notifications_unread on notifications(recipient_id) where read = false;

-- Enable RLS
alter table notifications enable row level security;

-- Set REPLICA IDENTITY FULL so Supabase real-time RLS filtering works
alter table notifications replica identity full;

-- RLS Policies
-- Users can read their own notifications
create policy "Users can read own notifications"
  on notifications for select
  using (recipient_id in (
    select id from profiles where auth_user_id = auth.uid()
  ));

-- Any authenticated user can insert notifications (User A notifies User B)
create policy "Authenticated users can insert notifications"
  on notifications for insert
  with check (auth.role() = 'authenticated');

-- Users can update their own notifications (mark as read)
create policy "Users can update own notifications"
  on notifications for update
  using (recipient_id in (
    select id from profiles where auth_user_id = auth.uid()
  ));

-- Users can delete their own notifications
create policy "Users can delete own notifications"
  on notifications for delete
  using (recipient_id in (
    select id from profiles where auth_user_id = auth.uid()
  ));

-- Enable realtime for notifications table
alter publication supabase_realtime add table notifications;
