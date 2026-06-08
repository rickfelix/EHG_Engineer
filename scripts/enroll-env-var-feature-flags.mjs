// enroll-env-var-feature-flags.mjs — enroll ungoverned process.env feature flags into
// leo_feature_flags so they are reviewed/governed instead of silently bypassing the registry.
// SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-3). Idempotent: existing flags are left in place
// (governance columns are refreshed). Runtime reads stay on process.env — this only governs them.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createFlag, getFlag } from '../lib/feature-flags/registry.js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The flags to enroll. owner_type must be 'user' | 'team'. gates_what / enablement_criteria
// are governance columns createFlag() does not set, so they are applied via a follow-up update.
const FLAGS = [
  {
    flagKey: 'COORD_ADAM_REVIEW_V1',
    displayName: 'Coordinator↔Adam bidirectional review lane',
    description: 'Default-OFF switch (read via process.env in scripts/coordinator-self-review.mjs) that pulls role=adam sessions into their own bidirectional review lane. When OFF, behavior is byte-identical to the prior worker-only review.',
    gates_what: 'Whether coordinator-self-review.mjs partitions Adam participants into a distinct coordinator↔Adam feedback lane (process.env.COORD_ADAM_REVIEW_V1 === "on").',
    enablement_criteria: 'Enable once the Adam advisory role is live and the coordinator wants reciprocal review; verify coordinator_adam_review feedback rows begin to appear.',
    ownerType: 'team', ownerId: 'coordinator', riskTier: 'low'
  },
  {
    flagKey: 'COORD_REVIEW_EVERY',
    displayName: 'Coordinator review cadence (completed-SD threshold)',
    description: 'Numeric work-trigger threshold (read via process.env in scripts/coordinator-self-review.mjs, default 8): the coordinator performance review fires after this many completed SDs since the last review.',
    gates_what: 'The completed-SD delta that triggers the coordinator self-review solicitation (process.env.COORD_REVIEW_EVERY, default 8).',
    enablement_criteria: 'Config knob, not a boolean toggle — registered for governance/visibility. Tune the threshold; lower = more frequent reviews.',
    ownerType: 'team', ownerId: 'coordinator', riskTier: 'low'
  },
  {
    flagKey: 'FLAG_GOVERNANCE_REVIEW_V1',
    displayName: 'Scheduled feature-flag governance review job',
    description: 'Default-OFF gate for scripts/flag-governance-review.mjs (the scheduled cheap-poller that stamps last_reviewed_at and emits the stale-flag digest). When OFF the job is a cheap no-op; --force overrides for baseline/smoke runs.',
    gates_what: 'Whether the scheduled flag-governance review job actually runs (vs cheap no-op).',
    enablement_criteria: 'Enable after a baseline run confirms the digest and stamping behave; then arm the cron loop in coordinator-startup-check.mjs.',
    ownerType: 'team', ownerId: 'coordinator', riskTier: 'low'
  }
];

export async function enrollMain() {
  const results = [];
  for (const f of FLAGS) {
    const existing = await getFlag(f.flagKey);
    if (!existing) {
      await createFlag({
        flagKey: f.flagKey, displayName: f.displayName, description: f.description,
        isEnabled: false, ownerType: f.ownerType, ownerId: f.ownerId, riskTier: f.riskTier,
        changedBy: 'SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001'
      });
      results.push({ flag: f.flagKey, action: 'created' });
    } else {
      results.push({ flag: f.flagKey, action: 'exists' });
    }
    // Refresh governance columns createFlag() does not set (idempotent).
    const { error } = await db.from('leo_feature_flags')
      .update({ gates_what: f.gates_what, enablement_criteria: f.enablement_criteria, target: 'EHG_Engineer' })
      .eq('flag_key', f.flagKey);
    if (error) console.error(`[ENROLL] ${f.flagKey} governance-column update failed: ${error.message}`);
  }
  for (const r of results) console.log(`[ENROLL] ${r.flag}: ${r.action}`);
  return results;
}

if (process.argv[1] && /enroll-env-var-feature-flags\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  enrollMain().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
