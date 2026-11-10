-- "Best Sellers": a flag on a product (shown as a shelf on the home page; the admin keeps the newest 10).
ALTER TABLE products ADD COLUMN best_seller BOOLEAN NOT NULL DEFAULT false;
