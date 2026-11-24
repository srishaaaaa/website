-- Prices entered on products include GST. An advance order remembers whether its bill should work out the GST inside the price.
ALTER TABLE pos_advances ADD COLUMN IF NOT EXISTS gst_inclusive BOOLEAN NOT NULL DEFAULT false;
