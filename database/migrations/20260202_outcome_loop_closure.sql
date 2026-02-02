-- Outcome Loop Closure Automation
-- SD-LEO-ORCH-SELF-IMPROVING-LEO-001-C

-- 1) Outcome signals
CREATE TABLE IF NOT EXISTS outcome_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  signal_type text NOT NULL,
  sd_id varchar(50) NOT NULL,
  source_feedback_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE outcome_signals
  ADD CONSTRAINT outcome_signals_sd_id_fkey
  FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_outcome_signals_sd_id_created_at
  ON outcome_signals (sd_id, created_at);

CREATE INDEX IF NOT EXISTS idx_outcome_signals_signal_type
  ON outcome_signals (signal_type);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_outcome_signals_completion
  ON outcome_signals (signal_type, sd_id)
  WHERE signal_type = 'sd_completion' AND source_feedback_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_outcome_signals_recurrence
  ON outcome_signals (signal_type, sd_id, source_feedback_id)
  WHERE source_feedback_id IS NOT NULL;

-- 2) SD effectiveness metrics
CREATE TABLE IF NOT EXISTS sd_effectiveness_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id varchar(50) NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  pre_feedback_count integer NOT NULL DEFAULT 0,
  post_feedback_count integer NOT NULL DEFAULT 0,
  delta_count integer NOT NULL DEFAULT 0,
  pct_change numeric(10,4),
  computed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE sd_effectiveness_metrics
  ADD CONSTRAINT sd_effectiveness_metrics_sd_id_fkey
  FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sd_effectiveness_window
  ON sd_effectiveness_metrics (sd_id, window_start, window_end);

CREATE INDEX IF NOT EXISTS idx_sd_effectiveness_metrics_sd_id
  ON sd_effectiveness_metrics (sd_id);

-- 3) Feedback linkage + resolution fields
ALTER TABLE leo_feedback
  ADD COLUMN IF NOT EXISTS sd_id varchar(50),
  ADD COLUMN IF NOT EXISTS resolved_by_sd_id varchar(50),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leo_feedback_status_check'
  ) THEN
    ALTER TABLE leo_feedback DROP CONSTRAINT leo_feedback_status_check;
  END IF;
END $$;

ALTER TABLE leo_feedback
  ADD CONSTRAINT leo_feedback_status_check
  CHECK (
    status = ANY (ARRAY[
      'pending',
      'vetted',
      'rejected',
      'implemented',
      'duplicate',
      'resolved'
    ])
  );

CREATE INDEX IF NOT EXISTS idx_leo_feedback_sd_id
  ON leo_feedback (sd_id);

CREATE INDEX IF NOT EXISTS idx_leo_feedback_resolved_by_status_created
  ON leo_feedback (resolved_by_sd_id, status, created_at);

-- 4) Trigger: sd_completion outcome signal
CREATE OR REPLACE FUNCTION fn_record_sd_completion_signal()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO outcome_signals (signal_type, sd_id, source_feedback_id, metadata)
    VALUES ('sd_completion', NEW.id, NULL, jsonb_build_object('source', 'db_trigger'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_sd_completion_signal ON strategic_directives_v2;

CREATE TRIGGER trg_record_sd_completion_signal
AFTER UPDATE OF status ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION fn_record_sd_completion_signal();
