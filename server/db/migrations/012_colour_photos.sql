-- Photos can belong to one colour of a product (NULL = shown for every colour). Additive only.
ALTER TABLE product_images ADD COLUMN color TEXT;
