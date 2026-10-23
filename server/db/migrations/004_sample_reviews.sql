-- Sample (demo) reviews: lets the storefront show a populated reviews section before real customers have reviewed.
-- They are flagged is_demo, carry no customer account, are labelled "Sample review" in the UI, and are only shown
-- while the store setting flags.demoReviews is true.
ALTER TABLE product_reviews ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE product_reviews ADD COLUMN author_name TEXT;
ALTER TABLE product_reviews ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_author_chk CHECK (user_id IS NOT NULL OR (is_demo AND author_name IS NOT NULL));
