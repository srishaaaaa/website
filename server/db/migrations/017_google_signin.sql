-- Sign in with Google: accounts created through Google have no password, and keep Google's stable user id. Additive only.
ALTER TABLE profiles ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE profiles ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX profiles_google_sub_key ON profiles (google_sub) WHERE google_sub IS NOT NULL;
