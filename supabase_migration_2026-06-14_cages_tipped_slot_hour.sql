-- Migration: add slot_hour to cages_tipped_photos
-- Records which 1-hour time slot (0-23) a photo is filed under.
-- Shift starts at 07:00 so slots run 07,08,...,23,00,01,...,06.

ALTER TABLE cages_tipped_photos
  ADD COLUMN IF NOT EXISTS slot_hour integer NOT NULL DEFAULT 0;
