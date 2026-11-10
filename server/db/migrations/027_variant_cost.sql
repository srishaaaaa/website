-- Optional cost price per size (NULL = use the product's cost price).
ALTER TABLE product_variants ADD COLUMN cost_override INT CHECK (cost_override >= 0);
