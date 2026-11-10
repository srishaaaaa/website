-- "Complete the look": up to 4 hand-picked pieces shown on a product page, in order.
CREATE TABLE product_suggestions (
  product_id   INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  suggested_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, suggested_id),
  CHECK (product_id <> suggested_id)
);
