-- Product weight in grams: the online delivery charge can be worked out from the total weight of the bag (weight tiers per region).
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INT NOT NULL DEFAULT 0 CHECK (weight_grams >= 0);

-- Sensible starting weights by category for the products that have none yet (editable per product in Inventory → Edit product).
UPDATE products p SET weight_grams = w.g FROM (VALUES
  ('sarees', 650), ('lehengas', 1600), ('salwar-suits', 700), ('kurtas', 350), ('dresses', 500),
  ('dupattas', 200), ('blouses', 150), ('co-ords', 450), ('couple-combos', 1000), ('festive', 900)
) AS w(slug, g), categories c
WHERE c.id = p.category_id AND c.slug = w.slug AND p.weight_grams = 0;
UPDATE products SET weight_grams = 500 WHERE weight_grams = 0;
