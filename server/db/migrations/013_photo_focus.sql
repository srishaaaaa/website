-- Which part of a photo must stay visible when the site crops it (percent from the left / top). NULL = automatic. Additive only.
ALTER TABLE product_images ADD COLUMN focus_x SMALLINT CHECK (focus_x IS NULL OR focus_x BETWEEN 0 AND 100);
ALTER TABLE product_images ADD COLUMN focus_y SMALLINT CHECK (focus_y IS NULL OR focus_y BETWEEN 0 AND 100);
