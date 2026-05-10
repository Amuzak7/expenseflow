-- Add paid_at timestamp to track when approved expenses were marked as paid
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_at timestamptz;
