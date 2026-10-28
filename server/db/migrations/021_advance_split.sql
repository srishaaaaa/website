-- An advance order's deposit can be paid in more than one way (e.g. part cash, part QR). NULL = the whole deposit was paid
-- in deposit_mode, as before. Shape: {"cash": paise, "upi": paise, "card": paise}. Additive only.
ALTER TABLE pos_advances ADD COLUMN deposit_split JSONB;
