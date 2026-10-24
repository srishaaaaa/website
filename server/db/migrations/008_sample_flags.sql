-- Sample (demo) data is flagged so staff can delete it from the admin: individually, or all at once (Admin → Sample data).
ALTER TABLE products ADD COLUMN is_sample BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE enquiries ADD COLUMN is_sample BOOLEAN NOT NULL DEFAULT false;
-- reviews already carry is_demo (migration 004)
