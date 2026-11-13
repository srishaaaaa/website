-- Returns: per-item "back to stock" tick, split refunds, sequential RTN numbers and the admin who approved the refund.
ALTER TABLE pos_returns DROP CONSTRAINT IF EXISTS pos_returns_refund_mode_check;
ALTER TABLE pos_returns ADD CONSTRAINT pos_returns_refund_mode_check CHECK (refund_mode IN ('cash','upi','card','split'));
ALTER TABLE pos_returns ADD COLUMN IF NOT EXISTS refund_cash INT NOT NULL DEFAULT 0;
ALTER TABLE pos_returns ADD COLUMN IF NOT EXISTS refund_upi  INT NOT NULL DEFAULT 0;
ALTER TABLE pos_returns ADD COLUMN IF NOT EXISTS refund_card INT NOT NULL DEFAULT 0;
UPDATE pos_returns SET refund_cash = total WHERE refund_mode = 'cash' AND refund_cash + refund_upi + refund_card = 0;
UPDATE pos_returns SET refund_upi  = total WHERE refund_mode = 'upi'  AND refund_cash + refund_upi + refund_card = 0;
UPDATE pos_returns SET refund_card = total WHERE refund_mode = 'card' AND refund_cash + refund_upi + refund_card = 0;
ALTER TABLE pos_returns ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE pos_return_items ADD COLUMN IF NOT EXISTS restock BOOLEAN NOT NULL DEFAULT true;
CREATE SEQUENCE IF NOT EXISTS pos_return_seq;
