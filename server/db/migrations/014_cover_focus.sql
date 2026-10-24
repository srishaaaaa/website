-- Which part of a category / collection cover photo stays visible when it is cropped to its frame ("x% y%"). NULL = automatic. Additive only.
ALTER TABLE categories ADD COLUMN image_pos TEXT CHECK (image_pos IS NULL OR image_pos ~ '^[0-9]{1,3}% [0-9]{1,3}%$');
ALTER TABLE collections ADD COLUMN hero_pos TEXT CHECK (hero_pos IS NULL OR hero_pos ~ '^[0-9]{1,3}% [0-9]{1,3}%$');
