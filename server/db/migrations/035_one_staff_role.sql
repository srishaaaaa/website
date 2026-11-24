-- One Staff role: former stock staff become Staff (cashier). What a Staff member can open is chosen in Settings → Staff permissions.
UPDATE profiles SET role = 'cashier' WHERE role = 'inventory';
