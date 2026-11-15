-- Additive Phase 2 columns for databases created before these fields existed.
-- Safe to re-run: deploy.py ignores "duplicate column" errors.
ALTER TABLE clinics ADD COLUMN booking_url TEXT DEFAULT '';
ALTER TABLE clinics ADD COLUMN video_user_id TEXT DEFAULT '';
ALTER TABLE clinics ADD COLUMN video_name TEXT DEFAULT '';
