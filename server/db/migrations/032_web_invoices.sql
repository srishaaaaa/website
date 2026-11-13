-- Website orders get a real invoice (the same numbered, shareable invoice as a POS bill) once they are paid.
-- web_order_id ties the invoice to the website order, so each order has exactly one.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS web_order_id INT UNIQUE REFERENCES orders(id) ON DELETE SET NULL;

-- "Online" now means the website only: bills typed into the Billing panel are always offline billing.
UPDATE pos_sales SET source = 'offline' WHERE web_order_id IS NULL AND source = 'online';
