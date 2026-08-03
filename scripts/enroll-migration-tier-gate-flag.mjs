// enroll-migration-tier-gate-flag.mjs — register the migration tier gate on the ONE surface
// every execution path reads. SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-1). Idempotent.
//
// WHY THE FLAG IS NAMED "BYPASS" AND NOT "GATE" — this is the load-bearing design choice,
// not a naming preference. lib/feature-flags/evaluator.js returns enabled=false for
// evaluation_error, flag_not_found, kill_switch_active, lifecycle_draft/expired/archived and
// globally_disabled. Under GATE polarity every one of those would mean "gate off, destructive
// DDL auto-applies" — i.e. adopting the shared evaluator would have reproduced the exact
// fail-open defect this SD exists to kill, one layer up. Under BYPASS polarity the evaluator's
// false means "no bypass" means GATE ON, so every indeterminate outcome is already the safe
// one and no wrapper is needed. Renaming this flag to gate-polarity silently inverts a
// chairman security boundary; tests/unit/migration-tier-gate-bypass-flag.test.js pins it.
//
// risk_tier 'high' is also deliberate: registry.js requires 2 approvals to ENABLE a high-tier
// flag and 0 to disable it, so the dangerous direction (opening the gate) is hard and the safe
// direction (closing it) is free.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createFlag, getFlag } from '../lib/feature-flags/registry.js';
// Imported, never re-spelled: the reader owns the key, so a rename cannot leave the
// registrar creating one flag while the gate reads another (which would evaluate to
// flag_not_found — safe, but the gate would be permanently unbypassable and nobody
// would know why).
import { TIER_GATE_BYPASS_FLAG } from './modules/handoff/pre-checks/pending-migrations-check.js';

export { TIER_GATE_BYPASS_FLAG };

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FLAG = {
  flagKey: TIER_GATE_BYPASS_FLAG,
  displayName: 'Migration tier gate BYPASS (inverted polarity — enabled = gate OFF)',
  description:
    'INVERTED POLARITY. enabled=true means BYPASS the migration tier gate, i.e. TIER-2 ' +
    '(destructive/ambiguous) migrations may auto-apply at handoff. enabled=false — including ' +
    'every indeterminate read: DB unreachable, evaluation_error, flag_not_found, ' +
    'kill_switch_active, lifecycle_draft — means NO bypass, i.e. the gate is ON and TIER-2 ' +
    'defers to the unchanged 3-factor @approved-by chairman gate. The inversion is what makes ' +
    'the shared evaluator fail CLOSED for a security boundary. Do not rename to gate polarity.',
  gates_what:
    'Whether scripts/modules/handoff/pre-checks/pending-migrations-check.js tierGateEnabled() ' +
    'permits TIER-2 destructive DDL to auto-apply at handoff. Replaces the per-worktree ' +
    'process.env.LEO_MIGRATION_TIER_GATE read, which failed OPEN on an absent variable and ' +
    'diverged across worktrees because .env is a point-in-time copy that is never refreshed.',
  enablement_criteria:
    'Enable ONLY to deliberately suspend the tier gate fleet-wide, with chairman sign-off — it ' +
    'permits destructive DDL to auto-apply without the 3-factor gate. Normal rollback of the ' +
    'gate is this flag; the env var cannot turn the gate off (strengthen-only, FR-3). ' +
    'ATTACH NO ROLLOUT POLICY: a percentage rollout would make the security boundary hold for ' +
    'some subjectIds and not others, and the reader refuses rollout-derived affirmatives.',
  ownerType: 'team',
  ownerId: 'coordinator',
  riskTier: 'high'
};

export async function enrollTierGateBypassFlag() {
  const existing = await getFlag(FLAG.flagKey);
  let action = 'exists';
  if (!existing) {
    await createFlag({
      flagKey: FLAG.flagKey,
      displayName: FLAG.displayName,
      description: FLAG.description,
      isEnabled: false, // default-OFF == no bypass == gate ON
      ownerType: FLAG.ownerType,
      ownerId: FLAG.ownerId,
      riskTier: FLAG.riskTier,
      changedBy: 'SD-LEO-INFRA-TIER-GATE-FLAG-001'
    });
    action = 'created';
  }
  // Governance columns createFlag() does not set. Idempotent.
  const { error } = await db
    .from('leo_feature_flags')
    .update({
      gates_what: FLAG.gates_what,
      enablement_criteria: FLAG.enablement_criteria,
      target: 'EHG_Engineer'
    })
    .eq('flag_key', FLAG.flagKey);
  if (error) console.error(`[ENROLL] ${FLAG.flagKey} governance-column update failed: ${error.message}`);
  return { flag: FLAG.flagKey, action };
}

const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isDirect) {
  enrollTierGateBypassFlag()
    .then((r) => {
      console.log(`[ENROLL] ${r.flag}: ${r.action}`);
      // process.exitCode, never process.exit(): on Windows, exiting while the supabase handle
      // is still closing aborts the process and the shell observes 127 in EVERY branch.
      process.exitCode = 0;
    })
    .catch((e) => {
      console.error(`[ENROLL] failed: ${e?.message || e}`);
      process.exitCode = 1;
    });
}
