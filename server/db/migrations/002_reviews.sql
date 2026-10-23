-- Customer reviews: only customers with a paid order for the product may review, and reviews are moderated.
CREATE TABLE product_reviews (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 600),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX product_reviews_status_idx ON product_reviews (status, created_at DESC);
