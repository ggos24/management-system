-- Add 'tags' to the allowed types for custom_properties
ALTER TABLE custom_properties DROP CONSTRAINT IF EXISTS custom_properties_type_check;
ALTER TABLE custom_properties ADD CONSTRAINT custom_properties_type_check
  CHECK (type IN ('text', 'date', 'select', 'multiselect', 'person', 'tags'));
