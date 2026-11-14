-- A short code the owner chooses for each category (e.g. SAR for Sarees). Typing the code in any product search lists that whole category.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS categories_code_key ON categories (upper(code)) WHERE code IS NOT NULL;
