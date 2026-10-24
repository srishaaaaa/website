-- Admin-uploaded images. Stored in Postgres so the app works on hosts with no persistent disk (serverless).
-- Served by GET /api/media/:id with long-lived cache headers. Only JPEG/PNG/WebP are accepted (verified by magic bytes).
CREATE TABLE media_files (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data          BYTEA NOT NULL,
  mime          TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes         INT NOT NULL,
  original_name TEXT,
  created_by    INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
