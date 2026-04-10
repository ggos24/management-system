-- Add 'free' and 'busy' to the absences type CHECK constraint
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_type_check;
ALTER TABLE absences ADD CONSTRAINT absences_type_check
  CHECK (type IN ('holiday', 'sick', 'business_trip', 'day_off', 'free', 'busy'));
