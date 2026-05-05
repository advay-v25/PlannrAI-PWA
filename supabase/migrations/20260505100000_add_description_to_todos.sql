-- Add description column to todos
ALTER TABLE todos ADD COLUMN IF NOT EXISTS description TEXT;

-- Add order_index for drag-and-drop sorting
ALTER TABLE todos ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Make list_id nullable since we are moving away from lists
ALTER TABLE todos ALTER COLUMN list_id DROP NOT NULL;
