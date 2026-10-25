-- Customer profile: birthday and gender on the account, plus a private address book. Additive only.
ALTER TABLE profiles ADD COLUMN birthday DATE;
ALTER TABLE profiles ADD COLUMN gender TEXT CHECK (gender IN ('female','male','other'));

CREATE TABLE customer_addresses (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id  INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pin         TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_profile_idx ON customer_addresses (profile_id);
CREATE UNIQUE INDEX customer_addresses_one_default ON customer_addresses (profile_id) WHERE is_default;
