-- Fix: Add ON DELETE CASCADE to stitch_generation_metrics.venture_id FK
-- When a venture is deleted, its metrics should cascade-delete automatically.

ALTER TABLE stitch_generation_metrics
  DROP CONSTRAINT IF EXISTS stitch_generation_metrics_venture_id_fkey;

ALTER TABLE stitch_generation_metrics
  ADD CONSTRAINT stitch_generation_metrics_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE;

-- Rollback:
-- ALTER TABLE stitch_generation_metrics DROP CONSTRAINT IF EXISTS stitch_generation_metrics_venture_id_fkey;
-- ALTER TABLE stitch_generation_metrics ADD CONSTRAINT stitch_generation_metrics_venture_id_fkey FOREIGN KEY (venture_id) REFERENCES ventures(id);
