-- Per-product level at or below which the product counts as "low stock" (compared with its total across all sizes).
ALTER TABLE products ADD COLUMN low_stock_alert INT NOT NULL DEFAULT 3 CHECK (low_stock_alert >= 0);
