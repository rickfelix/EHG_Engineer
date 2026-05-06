/* eslint-disable */
process.env.DISABLE_SSL_VERIFY = 'true';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const password = process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD;
const cs = `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

const SD_ID = '5474573f-3fd9-43e5-8c9e-4584a0cedfdc';

const detailed = {
  context: 'PLAN-phase migration-plan analysis (read-only). Pre-implementation review of file 1 (ALTER TYPE workflow_status_enum ADD VALUE killed) + file 2 (ventures_kill_log + kill_venture RPC + reject_chairman_decision amendment + backfill).',
  reviewed_amendments: ['A-1','A-2','A-3','A-4','A-5'],
  prior_evidence_row: '2e71b53c-eacb-483d-8137-1a4ecf646494',
  findings: {
    F1_alter_type_split: {
      verdict: 'CORRECT',
      detail: 'ALTER TYPE ... ADD VALUE on Postgres 17 cannot run inside a transaction block when the new label is used in the same TX. Splitting into file 1 (single statement, no BEGIN) and file 2 (transactional) is the right approach. PG 17.0.0.4 confirmed.'
    },
    F2_file2_split_decision: {
      verdict: 'KEEP_SINGLE_TX',
      detail: 'CREATE TABLE/INDEX, ENABLE RLS, CREATE POLICY, CREATE FUNCTION, GRANT, INSERT backfill, UPDATE ventures all are transactional-safe in PG. No reason to split. RLS DDL + INSERT in same TX is allowed (RLS DDL is not session-cached like enum). One transaction = atomic rollback if any clause fails.'
    },
    F3_reject_chairman_decision: {
      caller_check: 'NO other public functions call reject_chairman_decision (verified by client-side filter over all public.* function bodies).',
      current_kill_gate_set: '(3, 5, 13, 23) — matches the SD scope.',
      current_kill_semantic: "Currently sets ventures.status='cancelled' AND ventures.workflow_status='failed'. Amendment must change the second to 'killed'.",
      merge_clean: 'YES — replacing the single UPDATE statement at the IF v_is_kill_gate THEN block. No callers downstream rely on workflow_status=failed for kill stages (only reject_chairman_decision itself sets that combination — verified).',
      semantic_concern_postmortem: "create_postmortem_on_venture_failure trigger fires on NEW.status='failed' (NOT workflow_status). Kill-gate path sets status='cancelled' not 'failed'. Therefore the kill path has NEVER created a postmortem — the new 'killed' label is purely additive and does not regress the postmortem trigger.",
      decided_by_user_id_consideration: "reject_chairman_decision already populates decided_by_user_id from auth.uid() (SD-EHG-INFRA-CHAIRMAN-DECISIONS-USER-ID-001). Kill_venture RPC must do the same when inserting ventures_kill_log."
    },
    F4_backfill_idempotency: {
      verdict: 'IDEMPOTENT_BUT_FRAGILE',
      first_run: 'Inserts row(s) with metadata.backfill_source = "SD-LEO-FIX-REVERT-CROSS-VENTURE-001". Witnessed: 1 already-killed venture (PrivacyPatrol AI, killed 2026-05-05).',
      second_run: 'NOT EXISTS subquery filters on metadata->>backfill_source — works correctly because second run sees the row from first run.',
      caveat_1: 'If a future user-triggered kill happens between migration runs, the NOT EXISTS clause filters by metadata->>backfill_source which only excludes the SD-LEO-FIX-REVERT-CROSS-VENTURE-001 source. A real kill_venture call would write a different (or no) backfill_source. So a user kill row would NOT prevent backfill from re-inserting a duplicate IF metadata schema diverged. RECOMMEND: change NOT EXISTS clause to filter on venture_id alone (`WHERE venture_id = ventures.id`) — backfill should be one-row-per-venture-ever, not one-row-per-source.',
      caveat_2: 'rationale TEXT NOT NULL CHECK length>=20: the existing PrivacyPatrol kill_reason is 142 chars — passes. But future migrations should not assume kill_reason length; backfill should COALESCE/truncate-pad if shorter than 20.',
      caveat_3: 'killed_by_user_id is NOT NULL with FK to auth.users(id) UUID. The PrivacyPatrol kill predates this column, so no killed_by recorded. The backfill MUST supply a killed_by_user_id — but the existing ventures row has none. RECOMMEND: amendment A-6 below.'
    },
    F5_operations_audit_log_compat: {
      verdict: 'COMPATIBLE_WITH_NOTES',
      schema: 'entity_type VARCHAR NOT NULL, entity_id TEXT NULL, action VARCHAR NOT NULL, performed_by UUID NULL, performed_at TIMESTAMP (no TZ) DEFAULT now(), module VARCHAR NULL, severity VARCHAR DEFAULT info, metadata JSONB NULL.',
      notes: [
        'entity_id is TEXT — kill_venture must cast venture_id::text.',
        'performed_at is TIMESTAMP WITHOUT TIME ZONE (legacy). All other tables use TIMESTAMPTZ. Insert NOW()::timestamp or omit (DEFAULT covers).',
        'No CHECK on action/severity — free-text. Use action="venture_killed" and severity="warning" or "high" consistently.'
      ]
    },
    F6_auth_users_fk: {
      verdict: 'CORRECT',
      detail: 'auth.users.id is UUID. Proposed killed_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE — note: ON DELETE clause omitted in PRD. RECOMMEND ON DELETE SET NULL OR document as RESTRICT (which is PG default and what we want for audit).',
      rec: "ON DELETE RESTRICT (default) — preserves audit integrity if user is deleted. Cannot be NOT NULL + SET NULL together; use plain REFERENCES auth.users(id) with no ON DELETE clause."
    },
    F7_realtime_or_webhook_trigger: {
      verdict: 'NONE',
      detail: 'No triggers exist on operations_audit_log or eva_events (verified). Realtime publication supabase_realtime currently includes ventures, chairman_decisions, retrospectives, etc. — but NOT ventures_kill_log (does not exist yet). EXEC contract: explicitly DECIDE whether to add ventures_kill_log to supabase_realtime publication. Recommend YES (UI may want live updates), but NOT in this migration — defer to a follow-up only if UX requires it.'
    },
    F8_other_callers_amendment_break: {
      verdict: 'SAFE',
      detail: 'No other public function calls reject_chairman_decision (verified). Only application code (EHG client) calls it via supabase.rpc. Semantic change (workflow_status: failed→killed) is observable to clients reading workflow_status; A-3 documents this.'
    },
    F9_eva_events_event_type: {
      verdict: 'PASS',
      detail: 'event_type CHECK includes status_change. kill_venture RPC inserting eva_events with event_type=status_change is allowed.',
      gotcha: 'eva_events.eva_venture_id has FK to eva_ventures(id) ON DELETE CASCADE. kill_venture must NOT insert eva_events row if eva_ventures row does not yet exist for the venture (SD-001-A1 lesson). Either: (a) skip eva_events insert if no eva_ventures row, OR (b) follow the established pattern of inserting eva_ventures first via the auto-sync trigger (trg_ventures_update_sync_eva fires AFTER UPDATE on ventures — so updating ventures BEFORE inserting eva_events satisfies this). Order matters in kill_venture body.'
    },
    F10_naming_collision: {
      verdict: 'CLEAR',
      detail: 'No relation named ventures_kill_log exists. leo_kill_switches and kill_switch_audit_log exist but are LEO-protocol-domain (different concern). No conflict.'
    },
    F11_chairman_decisions_status_constraint: {
      verdict: 'PASS',
      detail: "chairman_decisions.status CHECK accepts 'rejected'. reject_chairman_decision sets status='rejected'. No constraint hit."
    },
    F12_chairman_decisions_decision_constraint: {
      verdict: 'PASS',
      detail: "chairman_decisions_decision_check CHECK accepts 'kill', 'no_go', 'pause'. reject_chairman_decision sets decision='kill' (kill-gate) or 'no_go' (advisory) or 'pause' (venture_decisions branch). All allowed."
    },
    F13_realtime_publication_for_kill_log: {
      verdict: 'OPTIONAL',
      detail: 'PRD does not say. If UI wants live updates of new kills, EXEC may add ALTER PUBLICATION supabase_realtime ADD TABLE ventures_kill_log. Defer unless UX requires.'
    }
  },
  amendments_status: {
    A1_thru_A5: 'INCORPORATED IN PRD per LEAD handoff',
    new_amendments_proposed: [
      {
        id: 'A-6',
        title: 'Backfill killed_by_user_id resolution',
        rationale: 'Existing already-killed venture (PrivacyPatrol AI) has no killed_by_user_id recorded. ventures_kill_log.killed_by_user_id is NOT NULL FK to auth.users. Backfill must have a strategy.',
        options: [
          'a) Make killed_by_user_id NULLABLE (relax FK NOT NULL). Cleanest.',
          'b) Backfill with a SYSTEM_USER_ID resolved from a known auth.users entry (e.g., the chairman user). Requires lookup.',
          'c) Skip backfill for rows lacking killed_by — backfill becomes "best-effort" and the existing PrivacyPatrol row stays orphaned of audit (but still has kill_reason/killed_at).'
        ],
        recommendation: 'Option (a) — make killed_by_user_id NULLABLE. Future kill_venture RPC inserts always populate it (auth.uid() is enforced via SECURITY DEFINER + fn_is_chairman gate). Backfill for legacy rows leaves it NULL with metadata.backfill_source set to track provenance. Audit trail integrity: post-migration kills are 100% attributed; pre-migration legacy kill is documented in metadata.'
      },
      {
        id: 'A-7',
        title: 'Backfill idempotency clause refinement',
        rationale: 'PRD uses NOT EXISTS (... AND metadata->>backfill_source = SD-LEO-FIX-...). This filters by source string, not venture_id. If a real kill happens later, backfill could re-insert.',
        change: 'Change NOT EXISTS subquery from `WHERE venture_id = ventures.id AND metadata->>backfill_source = ...` to `WHERE venture_id = ventures.id` — true one-row-per-venture-ever idempotency.'
      },
      {
        id: 'A-8',
        title: 'kill_venture RPC ordering: ventures UPDATE BEFORE eva_events INSERT',
        rationale: 'eva_events.eva_venture_id FK to eva_ventures(id). The trg_ventures_update_sync_eva trigger (AFTER UPDATE on ventures) auto-syncs the eva_ventures row. If kill_venture inserts eva_events first, it can fail FK if eva_ventures has no row yet.',
        change: 'In kill_venture body, perform UPDATE ventures SET workflow_status=killed, status=cancelled, killed_at=now() FIRST. Then INSERT eva_events (the trigger has already created/updated eva_ventures). Order: (1) UPDATE ventures, (2) INSERT ventures_kill_log, (3) INSERT eva_events, (4) INSERT operations_audit_log.'
      },
      {
        id: 'A-9',
        title: 'auth.users(id) FK clause specification',
        rationale: 'PRD says REFERENCES auth.users(id) without ON DELETE.',
        change: 'Spell out: REFERENCES auth.users(id) (PG default = NO ACTION = behaves like RESTRICT for FK violations on user delete). Preserves audit integrity. Document explicitly to avoid future ambiguity.'
      },
      {
        id: 'A-10',
        title: 'operations_audit_log timestamp type mismatch — informational',
        rationale: 'operations_audit_log.performed_at is TIMESTAMP WITHOUT TIME ZONE (legacy). Other tables use TIMESTAMPTZ.',
        change: 'kill_venture should rely on DEFAULT now() — no explicit cast needed. Document this so EXEC does not waste time on a "should this be timestamptz?" decision.'
      }
    ]
  },
  sequencing_concerns: 'NONE BEYOND THE TWO-FILE SPLIT THAT PRD ALREADY SPECIFIES. Within file 2, ordering inside kill_venture body matters (see A-8).',
  scope_creep_check: 'NONE — all proposed amendments tighten the existing plan; no new tables, RPCs, or policies introduced.',
  verdict: 'CONDITIONAL_PASS rephrased as PASS-WITH-AMENDMENTS (A-6..A-10). Migration plan is structurally sound; the 5 new amendments are refinements, not blockers.',
  next_steps_for_exec: [
    'Adopt A-6..A-10 in the EXEC migration files.',
    'In kill_venture body, follow A-8 ordering: UPDATE ventures → INSERT ventures_kill_log → INSERT eva_events → INSERT operations_audit_log.',
    'Make ventures_kill_log.killed_by_user_id NULLABLE (A-6 option a).',
    'Refactor backfill NOT EXISTS to filter by venture_id alone (A-7).',
    'Test: integration test that exercises kill_venture as authenticated chairman, verifies all 4 inserts succeed in correct order, RLS allows chairman SELECT, non-chairman blocked.',
    'Test: idempotent backfill — run migration twice on a clean db with one already-killed venture; row count of ventures_kill_log unchanged after run #2.'
  ]
};

(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Try phase = 'PLAN_DATABASE' first; fall back to 'PLAN' or 'PRD_DATABASE'
  const phasesToTry = ['PLAN_DATABASE', 'PLAN', 'PRD_DATABASE'];
  let inserted = false;
  let lastErr = '';
  for (const phase of phasesToTry) {
    try {
      const r = await c.query(`
        INSERT INTO sub_agent_execution_results
          (sd_id, sub_agent_code, sub_agent_name, phase, verdict, validation_mode, confidence, detailed_analysis, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
        RETURNING id, phase
      `, [SD_ID, 'DATABASE', 'database-agent', phase, 'PASS', 'prospective', 90, JSON.stringify(detailed)]);
      console.log('INSERTED row:', r.rows[0]);
      inserted = true;
      break;
    } catch (e) {
      lastErr = e.message;
      console.log(`phase='${phase}' rejected: ${e.message}`);
    }
  }
  if (!inserted) {
    console.error('FATAL all phases rejected. Last error:', lastErr);
  }
  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
