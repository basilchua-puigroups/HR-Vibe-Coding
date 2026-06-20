-- Add task column to worker_attendance for per-slot task tracking
ALTER TABLE worker_attendance ADD COLUMN IF NOT EXISTS task TEXT;
