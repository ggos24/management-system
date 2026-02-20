-- Add sort_order column to custom_properties for column reordering
ALTER TABLE custom_properties ADD COLUMN sort_order int DEFAULT 0;

-- Backfill existing properties: assign sort_order based on creation order per team
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY id) - 1 AS rn
  FROM custom_properties
)
UPDATE custom_properties SET sort_order = ranked.rn
FROM ranked WHERE custom_properties.id = ranked.id;
