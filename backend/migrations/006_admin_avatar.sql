-- Profile photo: small square JPEG stored as a data URL (client resizes to <= ~15 KB).
ALTER TABLE admins ADD COLUMN IF NOT EXISTS avatar_url text;
