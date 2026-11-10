-- Return invoices (credit notes) issued against a completed POS bill.
CREATE TABLE pos_returns (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_no   TEXT NOT NULL UNIQUE,
  sale_id     INT NOT NULL REFERENCES pos_sales(id),
  reason      TEXT NOT NULL DEFAULT '',
  refund_mode TEXT NOT NULL CHECK (refund_mode IN ('cash','upi','card')),
  subtotal    INT NOT NULL DEFAULT 0,
  discount    INT NOT NULL DEFAULT 0,
  tax         INT NOT NULL DEFAULT 0,
  total       INT NOT NULL DEFAULT 0,
  share_token TEXT NOT NULL UNIQUE,
  created_by  INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE pos_return_items (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id    INT NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  sale_item_id INT NOT NULL REFERENCES pos_sale_items(id),
  quantity     INT NOT NULL CHECK (quantity > 0),
  line_total   INT NOT NULL DEFAULT 0,
  discount     INT NOT NULL DEFAULT 0,
  tax          INT NOT NULL DEFAULT 0
);
CREATE INDEX pos_returns_sale_idx ON pos_returns (sale_id);
CREATE INDEX pos_return_items_sale_item_idx ON pos_return_items (sale_item_id);
