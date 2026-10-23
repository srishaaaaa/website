-- Admin-managed store content: boutique location + hours, social links, policy pages.
-- Values are validated by the API; nothing here is pre-filled with invented details.
CREATE TABLE store_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
