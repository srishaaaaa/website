-- Cost price: what the boutique paid for a product, so the dashboard can show stock value, cost of goods sold and margin. Additive only.
-- products.cost_price is per unit, in paise. pos_sale_items.cost_snapshot keeps the unit cost at the moment of sale, so later cost changes never rewrite past profit.
ALTER TABLE products ADD COLUMN cost_price INT NOT NULL DEFAULT 0 CHECK (cost_price >= 0);
ALTER TABLE pos_sale_items ADD COLUMN cost_snapshot INT NOT NULL DEFAULT 0 CHECK (cost_snapshot >= 0);
