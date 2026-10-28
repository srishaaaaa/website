-- "New Arrivals" becomes a normal collection the admin can edit (Taxonomy → Edit pieces), starting with the 12 newest active pieces.
-- Additive only: nothing happens if a collection with this slug already exists.
INSERT INTO collections (name, slug, description, status, display_order)
SELECT 'New Arrivals', 'new-arrivals', 'The latest pieces in the boutique.', 'published', 0
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE slug = 'new-arrivals');

INSERT INTO collection_products (collection_id, product_id, display_order)
SELECT c.id, p.id, ROW_NUMBER() OVER (ORDER BY p.created_at DESC, p.id DESC) - 1
FROM collections c, (SELECT id, created_at FROM products WHERE status = 'active' ORDER BY created_at DESC, id DESC LIMIT 12) p
WHERE c.slug = 'new-arrivals' AND NOT EXISTS (SELECT 1 FROM collection_products x WHERE x.collection_id = c.id);
