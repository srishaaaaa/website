-- Tailoring progress of a bill that has stitching lines (shown on the Measurements page).
ALTER TABLE pos_sales ADD COLUMN tailoring_status TEXT NOT NULL DEFAULT 'pending' CHECK (tailoring_status IN ('pending','completed'));
