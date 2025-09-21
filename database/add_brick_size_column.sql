-- Add brick_size column to strategies table if it doesn't exist
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS brick_size NUMERIC DEFAULT 0.25;

-- Add comment to describe the column
COMMENT ON COLUMN strategies.brick_size IS 'Brick size for Renko charts';