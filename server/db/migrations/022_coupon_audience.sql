-- Coupons can be "sent only": they work only for the mobile numbers they were sent to from the Coupons page.
ALTER TABLE pos_coupons ADD COLUMN sent_only BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE pos_coupon_sends (
  id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coupon_id INT NOT NULL REFERENCES pos_coupons(id) ON DELETE CASCADE,
  phone     TEXT NOT NULL,
  name      TEXT NOT NULL DEFAULT '',
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, phone)
);
