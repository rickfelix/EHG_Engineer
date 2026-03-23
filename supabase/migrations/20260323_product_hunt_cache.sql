-- Product Hunt cache table
-- SD: SD-MAN-INFRA-PRODUCT-HUNT-GRAPHQL-001
--
-- Caches Product Hunt API results per venture+category with 24h TTL.

CREATE TABLE IF NOT EXISTS product_hunt_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  category TEXT NOT NULL,
  products JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phc_venture_category ON product_hunt_cache(venture_id, category);
CREATE INDEX idx_phc_expires ON product_hunt_cache(expires_at);

ALTER TABLE product_hunt_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON product_hunt_cache FOR ALL USING (auth.role() = 'service_role');
