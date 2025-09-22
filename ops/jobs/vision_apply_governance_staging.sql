-- Vision Governance Apply (staging)
-- Reads curated CSVs from ops/inbox/, creates SD/PRD drafts with DRY_RUN safety.
-- Required psql vars: DRY_RUN (0|1), ON_ERROR_STOP=1
\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 0) Inputs live under ops/inbox/ (curated from templates)
--    Expected headers:
--    - SD:  action,venture_id,stage,urgency,sd_id,sd_key,title,owner,decision_log_ref,evidence_ref,rationale
--    - PRD: action,venture_id,stage,urgency,prd_id,sd_id,title,priority,completeness_score,risk_rating,acceptance_criteria_json,notes

-- 1) Stage input into temp tables (tolerate missing files)
CREATE TEMP TABLE stg_sd_manifest(
  action text, venture_id uuid, stage text, urgency text,
  sd_id uuid, sd_key text, title text, owner text,
  decision_log_ref text, evidence_ref text, rationale text
);
\copy stg_sd_manifest FROM 'ops/inbox/vision_sd_manifest.csv' CSV HEADER

CREATE TEMP TABLE stg_prd_manifest(
  action text, venture_id uuid, stage text, urgency text,
  prd_id uuid, sd_id uuid, title text, priority text,
  completeness_score numeric, risk_rating text, acceptance_criteria_json text, notes text
);
\copy stg_prd_manifest FROM 'ops/inbox/vision_prd_manifest.csv' CSV HEADER

-- Accept optional sd_key in PRD manifest for easier curation
ALTER TABLE stg_prd_manifest ADD COLUMN IF NOT EXISTS sd_key text;

-- 2) Normalize + validate inputs (keep only 'create')
CREATE TEMP TABLE sd_in AS
SELECT
  LOWER(COALESCE(action,'create')) AS action,
  venture_id, stage, LOWER(COALESCE(urgency,'medium')) AS urgency,
  sd_id, NULLIF(TRIM(sd_key),'') AS sd_key,
  NULLIF(TRIM(title),'') AS title,
  NULLIF(TRIM(owner),'') AS owner,
  NULLIF(TRIM(decision_log_ref),'') AS decision_log_ref,
  NULLIF(TRIM(evidence_ref),'') AS evidence_ref,
  NULLIF(TRIM(rationale),'') AS rationale
FROM stg_sd_manifest
WHERE LOWER(COALESCE(action,'create'))='create';

-- 2b) Normalize PRDs with sd_key resolution
CREATE TEMP TABLE prd_in AS
WITH resolved AS (
  SELECT
    LOWER(COALESCE(action,'create')) AS action,
    venture_id, stage, LOWER(COALESCE(urgency,'medium')) AS urgency,
    prd_id,
    NULLIF(TRIM(sd_key),'') AS sd_key,
    COALESCE(
      sd_id,
      (SELECT id FROM strategic_directives_v2 WHERE sd_key = NULLIF(TRIM(stg_prd_manifest.sd_key),'') LIMIT 1)
    ) AS sd_id,
    NULLIF(TRIM(title),'') AS title,
    CASE
      WHEN priority ~* '^(P[0-3])'            THEN UPPER(priority)
      WHEN priority ~* '^high'                THEN 'High'
      WHEN priority ~* '^medium'              THEN 'Medium'
      WHEN priority ~* '^low'                 THEN 'Low'
      ELSE NULL
    END AS priority,
    CASE
      WHEN completeness_score BETWEEN 0 AND 100 THEN completeness_score
      ELSE NULL
    END AS completeness_score,
    CASE
      WHEN risk_rating ~* '^(low|medium|high)' THEN LOWER(risk_rating)
      ELSE 'medium'
    END AS risk_rating,
    NULLIF(TRIM(acceptance_criteria_json),'') AS acceptance_criteria_json,
    NULLIF(TRIM(notes),'') AS notes
  FROM stg_prd_manifest
  WHERE LOWER(COALESCE(action,'create'))='create'
)
SELECT * FROM resolved;

-- Validate sd_key resolution
DO $$
BEGIN
  -- Check for conflicts: both sd_id and sd_key provided but mismatch
  IF EXISTS (
    SELECT 1 FROM prd_in p1
    JOIN strategic_directives_v2 sd ON sd.sd_key = p1.sd_key
    WHERE p1.sd_key IS NOT NULL
      AND p1.sd_id IS NOT NULL
      AND sd.id != p1.sd_id
  ) THEN
    RAISE EXCEPTION 'PRD manifest conflict: sd_id and sd_key refer to different SDs';
  END IF;

  -- Check for missing: neither sd_id nor resolvable sd_key
  IF EXISTS (
    SELECT 1 FROM prd_in WHERE sd_id IS NULL
  ) THEN
    RAISE WARNING 'PRD rows with no SD linkage found - will log as errors';
  END IF;
END $$;

-- 3) Utilities
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()
-- slugify title for sd_key when missing
CREATE TEMP FUNCTION _slugify(txt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(coalesce(txt,'')), '[^a-z0-9]+', '-', 'g')
$$;

-- 4) Prepare results table
CREATE TEMP TABLE apply_results(
  entity text, action text, status text,
  sd_id uuid, sd_key text, prd_id uuid, msg text
);

-- 5) Apply SDs (idempotent via sd_key)
--    If sd_key missing, derive as SD-YYYY-MM-DD-<slug(title)>
DO $$
DECLARE r RECORD; v_key text; v_id uuid; did_upsert boolean;
BEGIN
  FOR r IN
    SELECT *, COALESCE(sd_key, 'SD-'||to_char(CURRENT_DATE,'YYYY-MM-DD')||'-'||_slugify(title)) AS k
    FROM sd_in
  LOOP
    IF r.title IS NULL OR r.owner IS NULL OR r.decision_log_ref IS NULL OR r.evidence_ref IS NULL THEN
      INSERT INTO apply_results(entity,action,status,sd_id,sd_key,msg)
      VALUES('sd','create','error',NULL,r.k,'missing required fields (title/owner/decision/evidence)');
      CONTINUE;
    END IF;

    -- find existing by sd_key
    SELECT id INTO v_id FROM strategic_directives_v2 WHERE sd_key = r.k LIMIT 1;

    IF v_id IS NULL THEN
      IF :DRY_RUN::int = 1 THEN
        INSERT INTO apply_results(entity,action,status,sd_id,sd_key,msg)
        VALUES('sd','create','would_create',NULL,r.k,'dry-run');
      ELSE
        INSERT INTO strategic_directives_v2(id, sd_key, title, owner, decision_log_ref, evidence_ref)
        VALUES(gen_random_uuid(), r.k, r.title, r.owner, r.decision_log_ref, r.evidence_ref)
        RETURNING id INTO v_id;
        INSERT INTO apply_results(entity,action,status,sd_id,sd_key,msg)
        VALUES('sd','create','created',v_id,r.k,'ok');
      END IF;
    ELSE
      INSERT INTO apply_results(entity,action,status,sd_id,sd_key,msg)
      VALUES('sd','create','exists',v_id,r.k,'skipped');
    END IF;
  END LOOP;
END $$;

-- 6) Apply PRDs (idempotent via sd_id+title). Require sd_id.
DO $$
DECLARE r RECORD; v_prd_id uuid;
BEGIN
  FOR r IN SELECT * FROM prd_in LOOP
    IF r.sd_id IS NULL THEN
      INSERT INTO apply_results(entity,action,status,prd_id,msg)
      VALUES('prd','create','error',NULL,'missing sd_id; provide link to directive');
      CONTINUE;
    END IF;

    -- does a PRD with same sd_id+title already exist?
    SELECT id INTO v_prd_id
    FROM product_requirements_v2
    WHERE sd_id = r.sd_id AND title = r.title
    LIMIT 1;

    IF v_prd_id IS NULL THEN
      IF :DRY_RUN::int = 1 THEN
        INSERT INTO apply_results(entity,action,status,sd_id,prd_id,msg)
        VALUES('prd','create','would_create',r.sd_id,NULL,'dry-run');
      ELSE
        INSERT INTO product_requirements_v2(
          id, sd_id, title, priority, completeness_score, risk_rating, acceptance_criteria_json
        ) VALUES (
          gen_random_uuid(), r.sd_id, r.title,
          COALESCE(r.priority,'P3'),
          COALESCE(r.completeness_score,0),
          COALESCE(r.risk_rating,'medium'),
          COALESCE(r.acceptance_criteria_json,'[]')::jsonb
        ) RETURNING id INTO v_prd_id;

        INSERT INTO apply_results(entity,action,status,sd_id,prd_id,msg)
        VALUES('prd','create','created',r.sd_id,v_prd_id,'ok');
      END IF;
    ELSE
      INSERT INTO apply_results(entity,action,status,sd_id,prd_id,msg)
      VALUES('prd','create','exists',r.sd_id,v_prd_id,'skipped');
    END IF;
  END LOOP;
END $$;

-- 7) Emit results
\copy (SELECT * FROM apply_results ORDER BY entity, status DESC) TO 'ops/checks/out/vision_apply_results.csv' WITH CSV HEADER;

-- 8) Commit/rollback by DRY_RUN
DO $$
BEGIN
  IF :DRY_RUN::int = 1 THEN
    RAISE NOTICE 'DRY_RUN=1, rolling back.';
    ROLLBACK;
  ELSE
    COMMIT;
  END IF;
END $$;