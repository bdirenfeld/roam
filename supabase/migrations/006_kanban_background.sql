-- Add kanban background URL column to trips table
ALTER TABLE trips ADD COLUMN IF NOT EXISTS kanban_background_url text;
