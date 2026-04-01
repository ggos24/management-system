-- Add schedule_sort_order to profiles for admin-controlled member ordering in Schedule view
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS schedule_sort_order int DEFAULT 0;
