-- A size can weigh differently from the product's base weight (blank = use the product's weight).
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS weight_grams INT CHECK (weight_grams IS NULL OR weight_grams >= 0);
