-- Retail and wholesale enquiries from the website. Stored so none are lost; staff review them in the admin.
CREATE TABLE enquiries (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('retail', 'wholesale')),
  name       TEXT NOT NULL,
  business   TEXT,
  phone      TEXT NOT NULL,
  email      TEXT,
  interest   TEXT,
  quantity   TEXT,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_status_idx ON enquiries (status, created_at DESC);
