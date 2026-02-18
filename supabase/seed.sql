-- ============================================================
-- Seed data for Management System
-- ============================================================

-- ===================
-- Teams
-- ===================
INSERT INTO teams (id, name, icon, schedule_type, hidden, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Website Editorial Team', 'FileText', 'shift-based', false, 0),
  ('a0000000-0000-0000-0000-000000000002', 'Website News Team', 'Globe', 'shift-based', true, 1),
  ('a0000000-0000-0000-0000-000000000003', 'YouTube Reports Team', 'Video', 'shift-based', false, 2),
  ('a0000000-0000-0000-0000-000000000004', 'Social Media Team', 'Instagram', 'absence-only', false, 3),
  ('a0000000-0000-0000-0000-000000000005', 'Management Team', 'Briefcase', 'absence-only', false, 4);

-- ===================
-- Profiles (no auth_user_id — linked manually after sign-up)
-- ===================
INSERT INTO profiles (id, name, role, job_title, avatar, team_id, status) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Alice Chen',    'admin', 'Editor in Chief',    'https://picsum.photos/100/100?random=1', 'a0000000-0000-0000-0000-000000000001', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'Bob Smith',     'user',  'Senior Producer',     'https://picsum.photos/100/100?random=2', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'Charlie Kim',   'user',  'Social Lead',         'https://picsum.photos/100/100?random=3', 'a0000000-0000-0000-0000-000000000004', 'vacation'),
  ('b0000000-0000-0000-0000-000000000004', 'Diana Prince',  'user',  'Journalist',          'https://picsum.photos/100/100?random=4', 'a0000000-0000-0000-0000-000000000001', 'sick'),
  ('b0000000-0000-0000-0000-000000000005', 'Evan Wright',   'user',  'Video Editor',        'https://picsum.photos/100/100?random=5', 'a0000000-0000-0000-0000-000000000003', 'active'),
  ('b0000000-0000-0000-0000-000000000006', 'Sarah Connor',  'admin', 'Operations Manager',  'https://picsum.photos/100/100?random=6', 'a0000000-0000-0000-0000-000000000005', 'active'),
  ('b0000000-0000-0000-0000-000000000007', 'Mike Ross',     'user',  'News Writer',         'https://picsum.photos/100/100?random=7', 'a0000000-0000-0000-0000-000000000002', 'active');

-- ===================
-- Tasks
-- ===================
INSERT INTO tasks (id, title, description, team_id, status, priority, due_date, content_type, notes, editor_ids, links, files) VALUES
  ('c0000000-0000-0000-0000-000000000001',
   'Deep Dive: AI in 2025',
   'Long read about the future of generative AI.',
   'a0000000-0000-0000-0000-000000000001',
   'Ready for Editing', 'high', '2025-06-15',
   'Editorial', 'Needs expert quotes',
   '["b0000000-0000-0000-0000-000000000001"]',
   '[{"title":"Reference 1","url":"https://google.com"}]',
   '[{"name":"draft_v1.docx","url":"#"}]');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date, content_type) VALUES
  ('c0000000-0000-0000-0000-000000000002',
   'Review: iPhone 17',
   'Comprehensive review video.',
   'a0000000-0000-0000-0000-000000000003',
   'Pre-Production', 'high', '2025-06-10',
   'Videoreport');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date) VALUES
  ('c0000000-0000-0000-0000-000000000003',
   'Weekly News Recap',
   'Instagram reel summarising the week.',
   'a0000000-0000-0000-0000-000000000004',
   'In Writing', 'medium', '2025-06-07');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date, content_type, editor_ids) VALUES
  ('c0000000-0000-0000-0000-000000000004',
   'Interview with Sam Altman',
   'Transcript and article.',
   'a0000000-0000-0000-0000-000000000001',
   'Published This Week', 'high', '2025-05-20',
   'Interview',
   '["b0000000-0000-0000-0000-000000000001"]');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date) VALUES
  ('c0000000-0000-0000-0000-000000000005',
   'Office Tour',
   'YouTube Shorts office tour.',
   'a0000000-0000-0000-0000-000000000004',
   'Done', 'low', '2025-05-15');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date) VALUES
  ('c0000000-0000-0000-0000-000000000006',
   'Documentary: Urban Farming',
   '20 min mini-doc.',
   'a0000000-0000-0000-0000-000000000003',
   'Production', 'medium', '2025-07-01');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date) VALUES
  ('c0000000-0000-0000-0000-000000000007',
   'Q3 Strategy Meeting',
   'Planning for next quarter.',
   'a0000000-0000-0000-0000-000000000005',
   'Urgent Important', 'high', '2025-06-01');

INSERT INTO tasks (id, title, description, team_id, status, priority, due_date) VALUES
  ('c0000000-0000-0000-0000-000000000008',
   'Breaking: Market Crash',
   'Urgent news update.',
   'a0000000-0000-0000-0000-000000000002',
   'Published', 'high', '2025-06-02');

-- ===================
-- Task Assignees
-- ===================
INSERT INTO task_assignees (task_id, member_id, sort_order) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 0),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 0),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', 1),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 0),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 0),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 0),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000005', 0),
  ('c0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000006', 0),
  ('c0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000007', 0);

-- ===================
-- Placements
-- ===================
INSERT INTO placements (id, name, sort_order) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'YouTube Report', 0),
  ('d0000000-0000-0000-0000-000000000002', 'YouTube Interview', 1),
  ('d0000000-0000-0000-0000-000000000003', 'YouTube Shorts', 2),
  ('d0000000-0000-0000-0000-000000000004', 'YouTube Community', 3),
  ('d0000000-0000-0000-0000-000000000005', 'Facebook Post', 4),
  ('d0000000-0000-0000-0000-000000000006', 'Instagram Post', 5),
  ('d0000000-0000-0000-0000-000000000007', 'Instagram Reels', 6),
  ('d0000000-0000-0000-0000-000000000008', 'Instagram Stories', 7),
  ('d0000000-0000-0000-0000-000000000009', 'Instagram Slider', 8),
  ('d0000000-0000-0000-0000-000000000010', 'Twitter Post', 9),
  ('d0000000-0000-0000-0000-000000000011', 'Website Article', 10),
  ('d0000000-0000-0000-0000-000000000012', 'Website Stories', 11),
  ('d0000000-0000-0000-0000-000000000013', 'LinkedIn Post', 12),
  ('d0000000-0000-0000-0000-000000000014', 'TikTok Video', 13),
  ('d0000000-0000-0000-0000-000000000015', 'Telegram Post', 14),
  ('d0000000-0000-0000-0000-000000000016', 'Threads Post', 15),
  ('d0000000-0000-0000-0000-000000000017', 'Bluesky Post', 16),
  ('d0000000-0000-0000-0000-000000000018', 'Reddit Post', 17),
  ('d0000000-0000-0000-0000-000000000019', 'Main Page', 18),
  ('d0000000-0000-0000-0000-000000000020', 'Newsletter', 19),
  ('d0000000-0000-0000-0000-000000000021', 'YouTube', 20),
  ('d0000000-0000-0000-0000-000000000022', 'Shorts', 21),
  ('d0000000-0000-0000-0000-000000000023', 'Instagram', 22),
  ('d0000000-0000-0000-0000-000000000024', 'TikTok', 23),
  ('d0000000-0000-0000-0000-000000000025', 'Stories', 24),
  ('d0000000-0000-0000-0000-000000000026', 'Internal', 25),
  ('d0000000-0000-0000-0000-000000000027', 'Ticker', 26),
  ('d0000000-0000-0000-0000-000000000028', 'Push', 27);

-- ===================
-- Task Placements (link by name lookup)
-- ===================

-- c001 → Main Page, Newsletter
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000001', id FROM placements WHERE name = 'Main Page';
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000001', id FROM placements WHERE name = 'Newsletter';

-- c002 → YouTube, Shorts
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000002', id FROM placements WHERE name = 'YouTube';
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000002', id FROM placements WHERE name = 'Shorts';

-- c003 → Instagram, TikTok
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000003', id FROM placements WHERE name = 'Instagram';
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000003', id FROM placements WHERE name = 'TikTok';

-- c004 → Main Page
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000004', id FROM placements WHERE name = 'Main Page';

-- c005 → Stories
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000005', id FROM placements WHERE name = 'Stories';

-- c006 → YouTube
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000006', id FROM placements WHERE name = 'YouTube';

-- c007 → Internal
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000007', id FROM placements WHERE name = 'Internal';

-- c008 → Ticker, Push
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000008', id FROM placements WHERE name = 'Ticker';
INSERT INTO task_placements (task_id, placement_id)
  SELECT 'c0000000-0000-0000-0000-000000000008', id FROM placements WHERE name = 'Push';

-- ===================
-- Team Statuses
-- ===================

-- Editorial
INSERT INTO team_statuses (team_id, name, sort_order, category) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Dropped',               0, 'ignored'),
  ('a0000000-0000-0000-0000-000000000001', 'Archive',               1, 'ignored'),
  ('a0000000-0000-0000-0000-000000000001', 'Stuck',                 2, 'ignored'),
  ('a0000000-0000-0000-0000-000000000001', 'Pitch',                 3, 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'Approved',              4, 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'Working on Next Week',  5, 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'Working on This Week',  6, 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'Working on Today',      7, 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'Ready for Editing',     8, 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'Published This Week',   9, 'completed'),
  ('a0000000-0000-0000-0000-000000000001', 'Need to Update (SEO)', 10, 'active');

-- Video
INSERT INTO team_statuses (team_id, name, sort_order, category) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'Pre-Production',  0, 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'Production',      1, 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'Post-Production', 2, 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'Published',       3, 'completed');

-- Social
INSERT INTO team_statuses (team_id, name, sort_order, category) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'Ready to be Taken', 0, 'active'),
  ('a0000000-0000-0000-0000-000000000004', 'In Writing',        1, 'active'),
  ('a0000000-0000-0000-0000-000000000004', 'In Design',         2, 'active'),
  ('a0000000-0000-0000-0000-000000000004', 'In Approvals',      3, 'active'),
  ('a0000000-0000-0000-0000-000000000004', 'Done',              4, 'completed');

-- Management
INSERT INTO team_statuses (team_id, name, sort_order, category) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'Urgent Important',         0, 'active'),
  ('a0000000-0000-0000-0000-000000000005', 'Urgent Not Important',     1, 'active'),
  ('a0000000-0000-0000-0000-000000000005', 'Important Not Urgent',     2, 'active'),
  ('a0000000-0000-0000-0000-000000000005', 'Not Urgent Not Important', 3, 'active');

-- Default statuses (NULL team_id)
INSERT INTO team_statuses (team_id, name, sort_order, category) VALUES
  (NULL, 'To Do',        0, 'active'),
  (NULL, 'In Progress',  1, 'active'),
  (NULL, 'Done',         2, 'completed');

-- News team (uses default statuses + Published)
INSERT INTO team_statuses (team_id, name, sort_order, category) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'To Do',       0, 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'In Progress', 1, 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'Published',   2, 'completed');

-- ===================
-- Team Content Types
-- ===================
INSERT INTO team_content_types (team_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Editorial'),
  ('a0000000-0000-0000-0000-000000000001', 'Opinion'),
  ('a0000000-0000-0000-0000-000000000001', 'Photoreport'),
  ('a0000000-0000-0000-0000-000000000001', 'Videoreport'),
  ('a0000000-0000-0000-0000-000000000003', 'Videoreport'),
  ('a0000000-0000-0000-0000-000000000003', 'Interview'),
  ('a0000000-0000-0000-0000-000000000003', 'Podcast'),
  ('a0000000-0000-0000-0000-000000000004', 'Slider Post'),
  ('a0000000-0000-0000-0000-000000000004', 'Image Post'),
  ('a0000000-0000-0000-0000-000000000005', 'Recurring'),
  ('a0000000-0000-0000-0000-000000000005', 'One-Time');

-- ===================
-- Absences
-- ===================
INSERT INTO absences (id, member_id, type, start_date, end_date, approved) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'holiday', '2025-06-01', '2025-06-14', true),
  ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'sick',    '2025-06-05', '2025-06-08', true);

-- ===================
-- Shifts
-- ===================
INSERT INTO shifts (id, member_id, date, start_time, end_time) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2025-06-02', '09:00', '17:00'),
  ('f1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '2025-06-03', '09:00', '17:00'),
  ('f1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', '2025-06-02', '10:00', '18:00'),
  ('f1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000007', '2025-06-02', '08:00', '16:00');

-- ===================
-- Permissions
-- ===================
INSERT INTO permissions (member_id, can_create, can_edit, can_delete) VALUES
  ('b0000000-0000-0000-0000-000000000001', true, true,  true),   -- Alice (admin)
  ('b0000000-0000-0000-0000-000000000002', true, false, false),  -- Bob
  ('b0000000-0000-0000-0000-000000000003', true, false, false),  -- Charlie
  ('b0000000-0000-0000-0000-000000000004', true, false, false),  -- Diana
  ('b0000000-0000-0000-0000-000000000005', true, false, false),  -- Evan
  ('b0000000-0000-0000-0000-000000000006', true, true,  true),   -- Sarah (admin)
  ('b0000000-0000-0000-0000-000000000007', true, false, false);  -- Mike

-- ===================
-- Activity Log
-- ===================
INSERT INTO activity_log (id, user_id, action, details, timestamp) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Task Created',    'Created task "Deep Dive: AI in 2025"',            '2025-06-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Status Updated',  'Moved "Review: iPhone 17" to Pre-Production',     '2025-06-02T14:30:00Z'),
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Absence Added',   'Added Holiday for Charlie Kim',                    '2025-06-03T09:15:00Z'),
  ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000006', 'Team Setting',    'Added new status "Pitch" to Editorial',            '2025-06-04T11:20:00Z'),
  ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000007', 'Task Updated',    'Updated priority for "Market Crash"',              '2025-06-05T08:00:00Z'),
  ('e0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'File Attached',   'Attached "draft_v1.docx" to Task 101',            '2025-06-05T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000006', 'Shift Created',   'Assigned shift to Mike Ross',                      '2025-06-06T15:45:00Z'),
  ('e0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001', 'Integration',     'Connected Slack workspace',                        '2025-06-07T12:00:00Z');

-- ===================
-- App Settings
-- ===================
INSERT INTO app_settings (id, integrations, updated_at) VALUES
  (1, '{}', now());
