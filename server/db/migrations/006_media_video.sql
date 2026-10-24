-- Allow short MP4 / WebM clips (e.g. Instagram-style reels) alongside images in the media store.
ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_mime_check;
ALTER TABLE media_files ADD CONSTRAINT media_files_mime_check CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'));
