-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B — spine core substrate (FR-1/FR-2/FR-4/FR-5).
-- Additive-only DDL (TIER-1: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS;
-- no DROP/ALTER/OR REPLACE/SECURITY DEFINER/DO blocks). Role seeding is deliberately
-- NOT in this migration (DML is tier-2); roles are seeded by the folded factory path
-- through the born-denied gate.
--
-- Design provenance: PRD-SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B metadata.design_spike
-- (writer-identity mechanism, chairman org-centered ratification 2026-07-11) +
-- docs/design/spine-system-architecture-review.md §2/§5 (e895ecdd).

-- Role registry: per-ROLE identity is structural (VP_GROWTH != VP_OPS != one brain).
-- is_routing_role marks chief-of-staff/routing roles (EVA) that may never hold
-- domain write surfaces (anti-bottleneck invariant in lib/org/gates/writer-authorization.cjs).
CREATE TABLE IF NOT EXISTS org_agent_roles (
  role_key        TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  domain          TEXT,
  is_routing_role BOOLEAN NOT NULL DEFAULT false,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Org-agent identities: born DENIED — creating a row grants nothing; every write
-- authority arrives as an explicit decision-binding disposition (kind='writer_auth')
-- keyed (identity id, write surface), granted only by chairman/coordinator/calibration-engine.
CREATE TABLE IF NOT EXISTS org_agent_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID,
  role_key        TEXT NOT NULL REFERENCES org_agent_roles(role_key),
  display_name    TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  context_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_org_agent_identities_venture ON org_agent_identities(venture_id);

-- Objective registry (FR-4): venture-org objective functions. Modeled on the
-- gauge-registry/guardrail-registry shape: mode advisory|blocking, event-emission
-- handled by the writer layer (through the writer-auth gate).
CREATE TABLE IF NOT EXISTS org_objective_registry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id    UUID,
  objective_key TEXT NOT NULL,
  statement     TEXT NOT NULL,
  metric        TEXT,
  target        TEXT,
  mode          TEXT NOT NULL DEFAULT 'advisory' CHECK (mode IN ('advisory', 'blocking')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, objective_key)
);

-- Anti-Goodhart guard registry (FR-4): each guard watches an objective for
-- metric-gaming failure modes. guard_key is globally unique for event correlation.
CREATE TABLE IF NOT EXISTS org_guard_registry (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_key         TEXT NOT NULL,
  guard_key             TEXT NOT NULL UNIQUE,
  guard_type            TEXT NOT NULL DEFAULT 'anti_goodhart' CHECK (guard_type IN ('anti_goodhart', 'constraint', 'tripwire')),
  predicate_description TEXT NOT NULL,
  mode                  TEXT NOT NULL DEFAULT 'advisory' CHECK (mode IN ('advisory', 'blocking')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_guard_registry_objective ON org_guard_registry(objective_key);

-- Portfolio evidence fabric (FR-5): ONE provenance-typed evidence store consumed by
-- satellite writers/readers (vigilance F, learning loop E first). Provenance taxonomy
-- follows the G3 activation doctrine: a replayed_fixture is never a real_event.
CREATE TABLE IF NOT EXISTS portfolio_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID,
  evidence_kind   TEXT NOT NULL,
  provenance      TEXT NOT NULL CHECK (provenance IN ('real_event', 'replayed_fixture', 'synthetic', 'attested', 'derived')),
  source_identity UUID REFERENCES org_agent_identities(id),
  source_module   TEXT,
  subject_type    TEXT,
  subject_id      TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_evidence_venture_kind ON portfolio_evidence(venture_id, evidence_kind);
CREATE INDEX IF NOT EXISTS idx_portfolio_evidence_subject ON portfolio_evidence(subject_type, subject_id);
