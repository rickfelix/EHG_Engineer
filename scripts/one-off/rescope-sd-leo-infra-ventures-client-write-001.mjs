// Re-scope SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 per coordinator disposition
// (signal 83226336, ACCEPTED IN FULL, 2026-08-23 18:47Z): the original premise
// was falsified (unqualified pg_policies query matched an abandoned
// portfolio.ventures decoy instead of the live public.ventures table).
// Re-scoping to what the measurement actually supports.

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function run() {
  const dotenv = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const SD_KEY = 'SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001';

  const title =
    'Ventures RLS integrity repair: retire portfolio.ventures decoy, close measured public.ventures gaps';

  const planContent = `# Ventures RLS integrity repair: retire the portfolio.ventures decoy, close measured public.ventures gaps

## Type
infrastructure

**Provenance / re-scope history**: Originally chairman-commissioned architecture eval repair R2 (.artifacts/solomon-arch-eval-20260823.md, S3 finding 3), premise: "any venture-access client can UPDATE ANY ventures column including current_lifecycle_stage." Adam's 2026-08-23 ~12:58Z "consumer census" REVISED but did not correct this -- both readings queried \`pg_policies WHERE tablename='ventures'\` without a \`schemaname\` filter and matched the ABANDONED \`portfolio.ventures\` table (1 row, dead since 2025-11-30, an orphaned scaffold of an abandoned SD-ARCH-EHG-000 three-schema consolidation) instead of the real, live \`public.ventures\` (152 rows, written same-day). Worker (Golf-3/Alpha-2, session 3108079c) falsified the premise via a schema-qualified pg_policies read plus an empirical RLS probe (SET LOCAL ROLE authenticated inside BEGIN/ROLLBACK); coordinator disposition 2026-08-23 18:47Z (signal 83226336, ACCEPTED IN FULL) directed: hold the writers-first migration, re-scope to what measurement supports. The original chairman GO stays attached to the SUPERSEDED scope; this re-scope requires fresh ratification (routes through Adam).

## Problem (measured, corrected)
1. \`public.ventures\` carries exactly 2 RLS policies: \`Allow service_role to manage ventures\` (ALL, service_role, qual=true) and \`authenticated_read_ventures\` (SELECT, authenticated, qual=true). There is NO UPDATE policy for authenticated/anon at all -- the original premise (broad client UPDATE access) is FALSE.
2. REAL bug instead: because there's no UPDATE policy, every client-side \`.update()\` against \`public.ventures\` is RLS-denied -- and Supabase JS does not throw on RLS-denied UPDATE (error===null, rowCount=0), so \`if (error) throw\` guards pass while the write silently no-ops. ~26 live browser call sites in the EHG app (evaStateMachines, recursionEngine, VentureNavControls, useNurseryVentures, useVentureData, evaRollback, services/ventures.ts, and others) are affected -- stage-advance/EVA-transition/recursion/rollback/venture-edit features may be silently non-functional in production today.
3. REAL bug instead: \`authenticated_read_ventures\` has qual=true -- every authenticated user can SELECT all 152 ventures cross-tenant, a real over-grant (read side, not write).
4. HAZARD: an abandoned \`portfolio.ventures\` table (1 row, dead since 2025-11-30) still carries a well-named, broad \`ventures_update_policy\` (qual = service_role OR portfolio.has_venture_access(id)) that keeps producing false-positive readings for anyone who queries pg_policies without a schema filter -- it has now independently misled two separate investigations. \`portfolio.has_venture_access(id)\` itself is NOT vestigial (used by ~9 live public.* RLS policies) -- only the \`portfolio.ventures\` table + its 4 own policies + 2 dependent FKs (portfolio.kill_switch_audit_log.venture_id, governance.eva_authority_levels.venture_id -- both same dead 2025-11-30 scaffold, both untouched since, zero code references in either repo) are dead.
5. Pre-existing, corroborated by both investigations: 3 disagreeing SECURITY DEFINER advance RPCs (advance_venture_stage / fn_advance_venture_stage / advance_venture_to_stage) with 3 different grants -- out of scope here, flagged for a follow-up SD (do not consolidate inline, avoid scope creep on an already-corrected SD).

## Scope (re-scoped, EHG_Engineer + EHG cross-repo)
- FR-1: Retire the \`portfolio.ventures\` decoy. Migration: drop the 2 dependent FK constraints (or \`DROP TABLE portfolio.ventures CASCADE\`, evaluate blast radius at PLAN), drop \`portfolio.ventures\` and its 4 policies. Do NOT touch \`portfolio.has_venture_access()\` -- it's live and does not query the table being dropped.
- FR-2: Document \`public.ventures\`' real policy posture as the canonical reference (this SD's own evidence) so no future eval/census re-derives it from scratch.
- FR-3: Close the measured cross-tenant read over-grant: scope \`authenticated_read_ventures\`'s qual to the caller's actual access (align with \`has_venture_access(id)\` or equivalent tenant/venture-membership check) instead of qual=true.
- FR-4: Close the measured silent-no-op write gap: add a real, correctly-scoped UPDATE policy for \`public.ventures\` (content-class columns client-writable directly; governance-class columns -- current_lifecycle_stage, status, orchestrator_state, launched_at -- routed through existing/consolidated SECURITY DEFINER advance RPCs, NOT a new broad grant) so the ~26 live call sites either work as designed (content-class) or fail LOUDLY instead of silently (governance-class, until routed through the RPC path). Chairman-gated ceremony apply per standing policy-change convention.
- FR-5: Negative + positive proof: post-apply, a client-role UPDATE of a content-class column succeeds; a client-role UPDATE of current_lifecycle_stage is refused (loudly, not silently); the RPC path succeeds for governance-class transitions.

## Out of scope
The original writers-first-migration scope (superseded -- no live writers currently succeed, so there's nothing to migrate away from before closing the grant); the 3-disagreeing-advance-RPCs consolidation (separate follow-up SD); strategic_directives_v2 writer choke (repair R5); eva_stage_gate_results machinery (T-minus P1-P3); teardown machinery (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001).

## Success criteria
- \`portfolio.ventures\` dropped, zero orphaned FK/trigger errors post-drop.
- \`public.ventures\` policy posture documented and matches live catalog (schema-qualified query, evidence attached).
- \`authenticated_read_ventures\` qual scoped to real access (grep-proof: cross-tenant SELECT of another org's venture fails).
- New/corrected UPDATE policy present; content-class client writes succeed, governance-class client writes fail LOUDLY (error, not silent no-op), RPC path succeeds.
- Ceremony apply recorded with readback (chairman-gated per policy-change convention).
`;

  const description = `${title}\n\n${planContent.slice(0, 500)}...`;

  const { data: before, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (readErr) throw readErr;

  const newMetadata = {
    ...before.metadata,
    plan_content: planContent,
    plan_content_hash: undefined, // stale hash from old scope; let downstream regenerate
    rescope_history: [
      ...(before.metadata?.rescope_history || []),
      {
        at: new Date().toISOString(),
        reason: 'premise falsified — unqualified pg_policies query matched abandoned portfolio.ventures decoy',
        disposition_signal_id: '83226336-1b22-4d61-b331-e951caebfdf0',
        prior_escalation_signal_ids: ['26318f2b-f183-4ab5-a93b-bcebb1b51c98', '151bf2b0-95eb-42a0-88a5-f2deb9cb91a2'],
        worker: 'Golf-3 (session 3108079c-d395-499a-a355-caac03d4a28d)',
      },
    ],
  };
  delete newMetadata.plan_content_hash;

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      title,
      description,
      scope: title,
      metadata: newMetadata,
    })
    .eq('sd_key', SD_KEY);
  if (updErr) throw updErr;

  console.log('Re-scoped', SD_KEY);
}
