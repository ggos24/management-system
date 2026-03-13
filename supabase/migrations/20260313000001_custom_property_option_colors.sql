-- Add option_colors column to custom_properties for tag color support
ALTER TABLE custom_properties ADD COLUMN IF NOT EXISTS option_colors jsonb DEFAULT '{}'::jsonb;
