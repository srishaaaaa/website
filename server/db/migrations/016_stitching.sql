-- Stitching Studio (admin only). Purely additive: no existing table or column is altered.
-- Customers reuse pos_customers; invoices reuse pos_sales (created through the POS createSale, never duplicated); money is integer paise.
-- Measurements are private: they live only in these tables and are served only by the staff-only /api/admin/stitching routes.

CREATE TABLE stitch_counters (
  year INT PRIMARY KEY,
  last INT NOT NULL DEFAULT 0
);

-- Garment types are configuration. measure_groups / spec_fields name entries of the code-level measurement templates and specification library.
CREATE TABLE stitch_garment_types (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  measure_groups TEXT[] NOT NULL DEFAULT '{}',
  spec_fields   TEXT[] NOT NULL DEFAULT '{}',
  base_price    INT NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  active        BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO stitch_garment_types (code, name, measure_groups, spec_fields, display_order) VALUES
  ('saree-blouse',   'Saree blouse',               '{blouse}',        '{neck_design,front_neck_depth,back_neck_depth,sleeve_style,sleeve_length,sleeve_opening,length,lining,padding,closure,embroidery,fit,hemming}', 1),
  ('bridal-blouse',  'Bridal blouse',              '{blouse}',        '{neck_design,front_neck_depth,back_neck_depth,sleeve_style,sleeve_length,sleeve_opening,length,lining,padding,closure,embroidery,fit,hemming}', 2),
  ('designer-blouse','Designer blouse',            '{blouse}',        '{neck_design,front_neck_depth,back_neck_depth,sleeve_style,sleeve_length,sleeve_opening,length,lining,padding,closure,embroidery,fit,hemming}', 3),
  ('kurti',          'Kurti',                      '{kurti}',         '{neck_design,sleeve_style,sleeve_length,sleeve_opening,length,lining,closure,embroidery,fit,hemming}', 4),
  ('salwar-suit',    'Salwar suit',                '{kurti,bottom}',  '{neck_design,sleeve_style,sleeve_length,length,lining,closure,embroidery,fit,hemming}', 5),
  ('churidar',       'Churidar',                   '{bottom}',        '{length,closure,fit,hemming}', 6),
  ('lehenga',        'Lehenga blouse and skirt',   '{blouse,skirt}',  '{neck_design,front_neck_depth,back_neck_depth,sleeve_style,sleeve_length,length,lining,padding,closure,embroidery,fit,hemming}', 7),
  ('gown',           'Gown or dress',              '{gown}',          '{neck_design,sleeve_style,sleeve_length,length,lining,padding,closure,embroidery,fit,hemming}', 8),
  ('alteration',     'Alteration only',            '{}',              '{fit,hemming}', 9),
  ('custom',         'Custom garment',             '{}',              '{neck_design,sleeve_style,sleeve_length,length,lining,closure,embroidery,fit,hemming}', 10);

CREATE TABLE stitch_tailors (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stitch_designs (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  garment_type_id INT NOT NULL REFERENCES stitch_garment_types(id),
  specs           JSONB NOT NULL DEFAULT '{}',
  instructions    TEXT NOT NULL DEFAULT '',
  image_url       TEXT,
  extra_charge    INT NOT NULL DEFAULT 0 CHECK (extra_charge >= 0),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer measurement book. Every edit appends a row to stitch_measure_history (history is never overwritten).
CREATE TABLE stitch_measure_profiles (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id   INT NOT NULL REFERENCES pos_customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  measure_group TEXT NOT NULL,
  unit          TEXT NOT NULL CHECK (unit IN ('in','cm')),
  vals          JSONB NOT NULL DEFAULT '{}',
  custom        JSONB NOT NULL DEFAULT '[]',
  fit_pref      TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  version       INT NOT NULL DEFAULT 1,
  archived      BOOLEAN NOT NULL DEFAULT false,
  created_by    INT REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by    INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stitch_measure_customer_idx ON stitch_measure_profiles (customer_id, archived);
CREATE TABLE stitch_measure_history (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id INT NOT NULL REFERENCES stitch_measure_profiles(id) ON DELETE CASCADE,
  version    INT NOT NULL,
  unit       TEXT NOT NULL,
  vals       JSONB NOT NULL,
  custom     JSONB NOT NULL DEFAULT '[]',
  fit_pref   TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  changed_by INT REFERENCES profiles(id) ON DELETE SET NULL,
  changed_name TEXT NOT NULL DEFAULT '',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stitch_measure_history_idx ON stitch_measure_history (profile_id, id DESC);

CREATE TABLE stitch_orders (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no        TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,            -- a double-clicked / retried submit can never create two orders
  customer_id     INT NOT NULL REFERENCES pos_customers(id),
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_phone  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','measurements_confirmed','materials_ready','cutting','stitching','trial_scheduled','trial_completed','alterations_required','finishing_qc','ready','delivered','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent','express')),
  tailor_id       INT REFERENCES stitch_tailors(id) ON DELETE SET NULL,
  order_date      DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  start_date      DATE,
  trial_date      DATE,
  delivery_date   DATE NOT NULL,
  is_gst          BOOLEAN NOT NULL DEFAULT false,
  gst_rate        INT NOT NULL DEFAULT 5 CHECK (gst_rate BETWEEN 0 AND 28),
  discount        INT NOT NULL DEFAULT 0 CHECK (discount >= 0),
  urgent_charge   INT NOT NULL DEFAULT 0 CHECK (urgent_charge >= 0),
  alteration_total INT NOT NULL DEFAULT 0 CHECK (alteration_total >= 0),
  subtotal        INT NOT NULL DEFAULT 0 CHECK (subtotal >= 0),   -- GST-exclusive, before discount (server-computed)
  tax_amount      INT NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount    INT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes           TEXT NOT NULL DEFAULT '',
  invoice_no      TEXT,                              -- the POS invoice (pos_sales.invoice_no) once billed
  delivered_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_by      INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (delivery_date >= order_date)
);
CREATE INDEX stitch_orders_status_idx   ON stitch_orders (status, delivery_date);
CREATE INDEX stitch_orders_delivery_idx ON stitch_orders (delivery_date);
CREATE INDEX stitch_orders_customer_idx ON stitch_orders (customer_id);
CREATE INDEX stitch_orders_tailor_idx   ON stitch_orders (tailor_id) WHERE tailor_id IS NOT NULL;
CREATE INDEX stitch_orders_created_idx  ON stitch_orders (created_at DESC);
CREATE INDEX stitch_orders_phone_idx    ON stitch_orders (customer_phone);

CREATE TABLE stitch_items (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id        INT NOT NULL REFERENCES stitch_orders(id) ON DELETE CASCADE,
  garment_type_id INT NOT NULL REFERENCES stitch_garment_types(id),
  garment_name    TEXT NOT NULL,                     -- snapshot, so renaming a type never rewrites old orders
  qty             INT NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 50),
  design_id       INT REFERENCES stitch_designs(id) ON DELETE SET NULL,
  specs           JSONB NOT NULL DEFAULT '{}',
  custom          JSONB NOT NULL DEFAULT '[]',       -- [{label, value}] extra specifications
  notes           TEXT NOT NULL DEFAULT '',
  fabric          JSONB NOT NULL DEFAULT '{}',
  measurements    JSONB NOT NULL DEFAULT '{}',       -- order-specific snapshot: { groups: { blouse: { unit, values, custom, profileId, profileVersion, takenAt } } }
  charges         JSONB NOT NULL DEFAULT '{}',       -- per-garment paise: base, design, embroidery, material
  unit_charge     INT NOT NULL DEFAULT 0 CHECK (unit_charge >= 0),
  position        INT NOT NULL DEFAULT 0
);
CREATE INDEX stitch_items_order_idx ON stitch_items (order_id, position);

CREATE TABLE stitch_status_history (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES stitch_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  override    BOOLEAN NOT NULL DEFAULT false,
  by_user     INT REFERENCES profiles(id) ON DELETE SET NULL,
  by_name     TEXT NOT NULL DEFAULT '',
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stitch_status_history_idx ON stitch_status_history (order_id, id);

CREATE TABLE stitch_activity (
  id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id INT NOT NULL REFERENCES stitch_orders(id) ON DELETE CASCADE,
  action   TEXT NOT NULL,
  detail   JSONB NOT NULL DEFAULT '{}',
  by_user  INT REFERENCES profiles(id) ON DELETE SET NULL,
  by_name  TEXT NOT NULL DEFAULT '',
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stitch_activity_idx ON stitch_activity (order_id, id DESC);

CREATE TABLE stitch_appointments (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    INT REFERENCES stitch_orders(id) ON DELETE SET NULL,
  customer_id INT NOT NULL REFERENCES pos_customers(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('measurement','trial','follow_up_trial','alteration','final_fitting','delivery')),
  starts_at   TIMESTAMPTZ NOT NULL,
  minutes     INT NOT NULL DEFAULT 30 CHECK (minutes BETWEEN 5 AND 480),
  tailor_id   INT REFERENCES stitch_tailors(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  notes       TEXT NOT NULL DEFAULT '',
  created_by  INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stitch_appt_time_idx ON stitch_appointments (starts_at);
CREATE INDEX stitch_appt_order_idx ON stitch_appointments (order_id);

CREATE TABLE stitch_alterations (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         INT NOT NULL REFERENCES stitch_orders(id) ON DELETE CASCADE,
  item_id          INT REFERENCES stitch_items(id) ON DELETE SET NULL,
  round            INT NOT NULL,
  reason           TEXT NOT NULL,
  feedback         TEXT NOT NULL DEFAULT '',
  corrections      TEXT NOT NULL DEFAULT '',
  charge           INT NOT NULL DEFAULT 0 CHECK (charge >= 0),
  tailor_id        INT REFERENCES stitch_tailors(id) ON DELETE SET NULL,
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  completion_notes TEXT NOT NULL DEFAULT '',
  created_by       INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  UNIQUE (order_id, round)
);

-- Quality checklist, one result per check per round (a new alteration round starts a fresh checklist; earlier rounds are kept).
CREATE TABLE stitch_qc (
  order_id   INT NOT NULL REFERENCES stitch_orders(id) ON DELETE CASCADE,
  round      INT NOT NULL DEFAULT 0,
  check_key  TEXT NOT NULL,
  passed     BOOLEAN NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  checked_by INT REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, round, check_key)
);

-- Payment ledger. Every rupee taken (or refunded) is a row here; the POS invoice is created from it, so nothing is billed twice.
CREATE TABLE stitch_payments (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id        INT NOT NULL REFERENCES stitch_orders(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('advance','part','final','refund')),
  amount          INT NOT NULL CHECK (amount > 0),
  mode            TEXT NOT NULL CHECK (mode IN ('cash','upi','card')),
  ref             TEXT,
  note            TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,              -- a double-clicked payment is recorded once
  received_by     INT REFERENCES profiles(id) ON DELETE SET NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stitch_payments_order_idx ON stitch_payments (order_id, id);
CREATE INDEX stitch_payments_time_idx ON stitch_payments (received_at);
