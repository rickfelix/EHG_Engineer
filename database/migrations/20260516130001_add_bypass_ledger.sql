-- Sibling A FR-A-2: bypass_ledger table (TEXT bypass_type + advisory trigger; NOT PostgreSQL ENUM)
-- Insert-only ledger of every bypass event with audit_log pairing.
-- Ordinal 20260516130001 strictly > Child 0 ordinals + > FR-A-1 ordinal.

CREATE TABLE IF NOT EXISTS bypass_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id UUID,  -- SOFT FK (no constraint) to avoid migration coupling
  bypass_type TEXT NOT NULL,
  bypass_reason TEXT NOT NULL,
  sd_key TEXT,
  sd_id UUID,
  phase TEXT,
  bypass_actor TEXT,
  bypass_quota_remaining INT,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  audit_log_id UUID,
  audit_log_written_at TIMESTAMPTZ,
  smoke_test_passed_at TIMESTAMPTZ,
  runtime_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bypass_ledger_bypass_reason_length_check'
  ) THEN
    ALTER TABLE bypass_ledger
      ADD CONSTRAINT bypass_ledger_bypass_reason_length_check
      CHECK (length(bypass_reason) >= 20);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bypass_ledger_sd_key ON bypass_ledger (sd_key);
CREATE INDEX IF NOT EXISTS idx_bypass_ledger_phase ON bypass_ledger (phase);
CREATE INDEX IF NOT EXISTS idx_bypass_ledger_created ON bypass_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bypass_ledger_correlation ON bypass_ledger (correlation_id);
CREATE INDEX IF NOT EXISTS idx_bypass_ledger_audit_log ON bypass_ledger (audit_log_id);

-- Known vocab list (advisory only — does NOT block writes; future vocab additions need no migration).
CREATE OR REPLACE FUNCTION bypass_ledger_advisory_vocab_trigger()
RETURNS trigger AS $$
DECLARE
  known_vocab TEXT[] := ARRAY['validation_bypass', 'gate_bypass', 'quota_bypass', 'emergency_bypass', 'gpg_sign_bypass'];
BEGIN
  IF NEW.bypass_type IS NOT NULL AND NOT (NEW.bypass_type = ANY(known_vocab)) THEN
    RAISE NOTICE 'bypass_ledger: advisory — bypass_type ''%'' not in known vocab list %', NEW.bypass_type, known_vocab;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bypass_ledger_vocab_advisory ON bypass_ledger;
CREATE TRIGGER bypass_ledger_vocab_advisory
  BEFORE INSERT ON bypass_ledger
  FOR EACH ROW EXECUTE FUNCTION bypass_ledger_advisory_vocab_trigger();

-- RLS: INSERT-only enforcement
ALTER TABLE bypass_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bypass_ledger_insert_only ON bypass_ledger;
CREATE POLICY bypass_ledger_insert_only ON bypass_ledger
  FOR INSERT TO PUBLIC WITH CHECK (true);

DROP POLICY IF EXISTS bypass_ledger_read_all ON bypass_ledger;
CREATE POLICY bypass_ledger_read_all ON bypass_ledger
  FOR SELECT TO PUBLIC USING (true);

-- No UPDATE / DELETE policies → all blocked by RLS

COMMENT ON TABLE bypass_ledger IS 'Sibling A (SD-WRITERCONSUMER-...-001-A) — insert-only ledger of every bypass event with audit_log pairing. RLS denies UPDATE/DELETE. TEXT bypass_type + advisory trigger (NOT ENUM) for future vocab additions.';
