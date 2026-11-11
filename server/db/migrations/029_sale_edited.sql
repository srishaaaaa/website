-- Invoices can be corrected after billing (customer details, date, note). The time of the last correction is kept so the invoice can say "Edited".
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
