-- 202509221310__eng_backlog_contract.sql
-- Normalizes backlog records into eng_backlog with governance-aligned constraints.

BEGIN;

DROP VIEW IF EXISTS v_prd_sd_payload;
DROP VIEW IF EXISTS strategic_directives_backlog;

ALTER TABLE IF EXISTS sd_backlog_map
    RENAME TO eng_backlog_legacy;

ALTER TABLE eng_backlog_legacy
    DROP CONSTRAINT IF EXISTS sd_backlog_map_pkey;

CREATE TABLE IF NOT EXISTS eng_backlog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID NOT NULL REFERENCES strategic_directives_v2(sd_uuid) ON DELETE CASCADE,
    prd_id UUID REFERENCES product_requirements_v2(prd_uuid) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('feature','bug','chore','doc')),
    state TEXT NOT NULL CHECK (state IN ('todo','doing','blocked','done')),
    priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),
    qa_gate_min NUMERIC NOT NULL CHECK (qa_gate_min >= 0 AND qa_gate_min <= 100),
    gate_status TEXT DEFAULT 'pending',
    legacy_backlog_id TEXT,
    title TEXT,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    import_run_id UUID,
    present_in_latest_import BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    commit_sha TEXT,
    pr_url TEXT
);

INSERT INTO eng_backlog (
    sd_id,
    prd_id,
    type,
    state,
    priority,
    qa_gate_min,
    gate_status,
    legacy_backlog_id,
    title,
    description,
    metadata,
    import_run_id,
    present_in_latest_import,
    created_at,
    updated_at
)
SELECT
    sd.sd_uuid,
    prd.prd_uuid,
    COALESCE(eng_backlog_legacy.extras->>'type', 'feature'),
    COALESCE(eng_backlog_legacy.extras->>'state', 'todo'),
    CASE UPPER(COALESCE(eng_backlog_legacy.priority, 'P2'))
        WHEN 'P0' THEN 'P0'
        WHEN 'CRITICAL' THEN 'P0'
        WHEN 'HIGH' THEN 'P1'
        WHEN 'P1' THEN 'P1'
        WHEN 'MEDIUM' THEN 'P2'
        WHEN 'P2' THEN 'P2'
        WHEN 'LOW' THEN 'P3'
        WHEN 'P3' THEN 'P3'
        ELSE 'P2'
    END,
    COALESCE((eng_backlog_legacy.extras->>'qa_gate_min')::NUMERIC, 0),
    COALESCE(eng_backlog_legacy.extras->>'gate_status', 'pending'),
    eng_backlog_legacy.backlog_id,
    eng_backlog_legacy.backlog_title,
    COALESCE(eng_backlog_legacy.item_description, eng_backlog_legacy.description_raw),
    jsonb_build_object(
        'my_comments', eng_backlog_legacy.my_comments,
        'stage_number', eng_backlog_legacy.stage_number,
        'phase', eng_backlog_legacy.phase,
        'new_module', eng_backlog_legacy.new_module,
        'extras', eng_backlog_legacy.extras
    ),
    eng_backlog_legacy.import_run_id,
    eng_backlog_legacy.present_in_latest_import,
    NOW(),
    NOW()
FROM eng_backlog_legacy
LEFT JOIN strategic_directives_v2 sd
       ON eng_backlog_legacy.sd_id = sd.id OR eng_backlog_legacy.sd_id = sd.legacy_id OR eng_backlog_legacy.sd_id = sd.sd_key
LEFT JOIN LATERAL (
    SELECT prd.prd_uuid
    FROM product_requirements_v2 prd
    WHERE prd.sd_id = sd.sd_uuid
    ORDER BY prd.version DESC
    LIMIT 1
) prd ON TRUE;

COMMIT;

/* DOWN */

BEGIN;

DROP TABLE IF EXISTS eng_backlog;

ALTER TABLE IF EXISTS eng_backlog_legacy
    RENAME TO sd_backlog_map;

-- Legacy primary key restoration
ALTER TABLE sd_backlog_map
    ADD PRIMARY KEY (sd_id, backlog_id);

CREATE OR REPLACE VIEW strategic_directives_backlog AS
SELECT
  id AS sd_id,
  sequence_rank,
  title AS sd_title,
  category AS page_category,
  NULL AS page_title,
  (SELECT COUNT(*) FROM sd_backlog_map m WHERE m.sd_id = v2.id) AS total_items,
  h_count,
  m_count,
  l_count,
  future_count,
  must_have_count,
  wish_list_count,
  must_have_pct,
  rolled_triage,
  readiness,
  must_have_density,
  new_module_pct,
  metadata AS extras,
  import_run_id,
  present_in_latest_import,
  created_at,
  updated_at
FROM strategic_directives_v2 v2
WHERE import_run_id IS NOT NULL;

CREATE OR REPLACE VIEW v_prd_sd_payload AS
SELECT
  sd.id AS sd_id,
  sd.sequence_rank,
  sd.title AS sd_title,
  sd.category AS page_category,
  NULL AS page_title,
  sd.rolled_triage,
  (SELECT COUNT(*) FROM sd_backlog_map m WHERE m.sd_id = sd.id) AS total_items,
  sd.h_count,
  sd.m_count,
  sd.l_count,
  sd.future_count,
  sd.must_have_count,
  sd.wish_list_count,
  sd.must_have_pct,
  sd.readiness,
  sd.must_have_density,
  sd.new_module_pct,
  sd.metadata AS sd_extras,
  sd.import_run_id,
  COALESCE(
    json_agg(
      jsonb_build_object(
        'backlog_id',       m.backlog_id,
        'backlog_title',    m.backlog_title,
        'description_raw',  m.description_raw,
        'item_description', m.item_description,
        'my_comments',      m.my_comments,
        'priority',         m.priority,
        'stage_number',     m.stage_number,
        'phase',            m.phase,
        'new_module',       m.new_module,
        'extras',           m.extras
      )
      ORDER BY m.stage_number NULLS LAST, m.backlog_id
    ) FILTER (WHERE m.backlog_id IS NOT NULL),
    '[]'::json
  ) AS items
FROM strategic_directives_v2 sd
LEFT JOIN sd_backlog_map m ON m.sd_id = sd.id
WHERE sd.import_run_id IS NOT NULL
GROUP BY sd.id;

COMMIT;
