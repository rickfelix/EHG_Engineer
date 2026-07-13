-- Migration: Venture Support Tickets
-- SD: SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001
-- Purpose: Dedicated table for venture customer-support tickets, so
--          lib/support/intake-pipeline.js stops writing into the shared
--          harness `feedback` table (chairman-ratified, deep-dive ed675631
--          Section 5, Solomon F12).
-- Considered-and-rejected alternative: reusing feedback.venture_id +
--          feedback_type='user_*' (added 2026-04-01 by
--          SD-LEO-INFRA-VENTURE-USER-FEEDBACK-001) -- that channel is for
--          user-submitted bug/feature-request feedback, a different domain
--          from customer support tickets (SLA/resolution tracking), and
--          reusing it would still route through every consumer of the
--          shared feedback table (pattern bridge, quality config,
--          LLM-triage, auto-close triggers, unified-inbox-builder).
-- @chairman-gated: staged, not yet applied
-- Date: 2026-07-13

BEGIN;

-- ============================================================
-- 1. venture_support_tickets table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venture_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  customer_ref text,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  routing_decision text,
  status text NOT NULL DEFAULT 'open',
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Matches triageSupportTicket()'s exact severity taxonomy (lib/support/intake-pipeline.js
  -- SEVERITY_HIGH/SEVERITY_MED buckets emit 'high'/'medium'/'low'); 'critical' reserved for
  -- future manual escalation, not currently emitted by the classifier.
  CONSTRAINT venture_support_tickets_severity_check
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT venture_support_tickets_status_check
    CHECK (status IN ('open', 'auto_resolved', 'escalated', 'resolved', 'closed')),
  CONSTRAINT venture_support_tickets_ticket_id_venture_unique
    UNIQUE (venture_id, ticket_id)
);

COMMENT ON TABLE public.venture_support_tickets
  IS 'Venture customer-support tickets. Replaces the shared feedback table as the write destination for lib/support/intake-pipeline.js (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001) -- never routes through harness feedback consumers.';

COMMENT ON COLUMN public.venture_support_tickets.venture_id
  IS 'Owning venture. Nullable: an unresolvable/unattributed ticket still escalates and is persisted here (venture_id=NULL) for human triage, rather than being silently dropped -- but is NEVER auto-resolved without one.';

COMMENT ON COLUMN public.venture_support_tickets.ticket_id
  IS 'Caller-supplied ticket identifier from the intake channel (unique per venture).';

COMMENT ON COLUMN public.venture_support_tickets.channel
  IS 'Intake channel the ticket arrived on (e.g. email, webhook) -- used to resolve the per-venture rail address.';

-- ============================================================
-- 2. FIRST CUSTOMER activation flag + per-venture rail address on ventures
--    is_armed is an explicit, human/chairman-armed gate -- NOT auto-detected.
-- ============================================================
ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS support_is_armed boolean NOT NULL DEFAULT false;

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS support_armed_at timestamptz;

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS support_rail_address text;

ALTER TABLE public.ventures
  ADD CONSTRAINT ventures_support_rail_address_unique UNIQUE (support_rail_address);

COMMENT ON COLUMN public.ventures.support_is_armed
  IS 'Explicit human/chairman-set FIRST CUSTOMER flag for the support pipeline. Default false. Never auto-detected (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001). Informational/readiness signal only -- does not block ticket intake/processing.';

COMMENT ON COLUMN public.ventures.support_armed_at
  IS 'Timestamp support_is_armed was last set true by a human/chairman action.';

COMMENT ON COLUMN public.ventures.support_rail_address
  IS 'Per-venture support intake address (e.g. email alias or webhook path). lib/support/intake-pipeline.js resolves venture_id from a ticket''s rail_address against this column when the caller does not already know the venture_id.';

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_venture_support_tickets_venture_created
  ON public.venture_support_tickets (venture_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venture_support_tickets_status
  ON public.venture_support_tickets (status)
  WHERE status IN ('open', 'escalated');

-- ============================================================
-- 4. RLS -- enabled + service_role policy in the SAME migration
--    (SPINE-001-B anon-writable-table recurrence: an RLS-less table,
--    even briefly, is a blocking condition, not a follow-up.)
-- ============================================================
ALTER TABLE public.venture_support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY venture_support_tickets_service_role_all
  ON public.venture_support_tickets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No anon policy: the support pipeline is a backend-only writer
-- (lib/support/intake-pipeline.js runs with the service-role key).
-- Unlike the 2026-04-01 venture_user_feedback channel, there is no
-- direct-from-browser anon INSERT path for support tickets today.

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed):
-- ============================================================
-- DROP POLICY IF EXISTS venture_support_tickets_service_role_all ON public.venture_support_tickets;
-- DROP INDEX IF EXISTS idx_venture_support_tickets_status;
-- DROP INDEX IF EXISTS idx_venture_support_tickets_venture_created;
-- ALTER TABLE public.ventures DROP CONSTRAINT IF EXISTS ventures_support_rail_address_unique;
-- ALTER TABLE public.ventures DROP COLUMN IF EXISTS support_rail_address;
-- ALTER TABLE public.ventures DROP COLUMN IF EXISTS support_armed_at;
-- ALTER TABLE public.ventures DROP COLUMN IF EXISTS support_is_armed;
-- DROP TABLE IF EXISTS public.venture_support_tickets;
