#!/usr/bin/env node
/**
 * Round 2 of PRE_PLAN_ADVERSARIAL_CRITIQUE corrections for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001.
 * Round 1 fixed 6 findings; this LLM-critique re-run (non-deterministic) surfaced 5 more, mostly
 * a subset/rephrasing of the same 2 root ambiguities: (a) FR-1's resolver-swap location was still
 * hedged as "X or Y", (b) FR-2's env-var config mechanism was never named concretely.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '1eadc0ce-2dd4-4841-b09c-cbd5f08c52b0';

const { data: prd, error: prdErr } = await supabase.from('product_requirements_v2').select('functional_requirements, system_architecture, acceptance_criteria').eq('sd_id', SD_ID).maybeSingle();
if (prdErr || !prd) { console.error('PRD lookup failed', prdErr); process.exit(1); }

const frs = prd.functional_requirements;
const fr1 = frs.find((f) => f.id === 'FR-1');
const fr2 = frs.find((f) => f.id === 'FR-2');

// Round-2 correction: COMMIT to the narrow, minimal-blast-radius location -- a route-local
// staleness check inside fleet-actions.js that calls fetchAllAdamsStrict/fetchAllSolomonsStrict
// directly for THIS route only, leaving getActiveAdamId/getActiveSolomonId's existing "fresh
// only" semantics UNCHANGED for every other caller. This resolves the ambiguity the critique
// flagged twice (round 1: "state which module"; round 2: "those are materially different
// scopes, changing the identity modules affects [other callers]").
fr1.description = fr1.description.replace(
  'ADVERSARIAL-CRITIQUE CORRECTIONS (LEAD phase, plan_critiques 8a58c846-4bb2-475d-aa5e-baacc6eec359): (1) the filtered-to-unfiltered resolver swap belongs in the RESOLVER-OWNING module (lib/coordinator/adam-identity.cjs getActiveAdamId / lib/coordinator/solomon-identity.cjs getActiveSolomonId -- or the fleet-actions.js route call site that invokes them), NOT in singleton-spawn-decision.mjs itself,',
  'ADVERSARIAL-CRITIQUE CORRECTIONS, ROUND 2 (LEAD phase, plan_critiques 8a58c846-4bb2-475d-aa5e-baacc6eec359 + follow-up re-run): DECIDED, not hedged -- getActiveAdamId/getActiveSolomonId (lib/coordinator/adam-identity.cjs / solomon-identity.cjs) are used by OTHER callers across the codebase for their existing "fresh only" semantics; widening them globally would change behavior for every other caller, a materially larger blast radius than this FR intends. The resolver swap is therefore SCOPED NARROWLY: fleet-actions.js\'s spawn-check route calls fetchAllAdamsStrict/fetchAllSolomonsStrict DIRECTLY, as a route-local staleness check, for THIS route only -- getActiveAdamId/getActiveSolomonId themselves are left completely unchanged. singleton-spawn-decision.mjs itself,'
);
fr1.acceptance_criteria = fr1.acceptance_criteria.filter((c) => !c.startsWith('The filtered-to-unfiltered resolver swap lands in the resolver-owning module'));
fr1.acceptance_criteria.push('The resolver swap is route-local: server/routes/fleet-actions.js calls fetchAllAdamsStrict/fetchAllSolomonsStrict directly for the spawn-check route only; getActiveAdamId/getActiveSolomonId (and every OTHER existing caller of them) are unchanged and unaffected -- a regression test proves at least one other getActiveAdamId/getActiveSolomonId caller behaves identically before and after this FR');

fr2.description += ' CONCRETE CONFIG MECHANISM (round 2 critique correction): FLEET_CONSOLE_REAPER_ENABLED=on is set the same way every other FLEET_*_ENABLED flag in this codebase is set -- as a line in the fleet hosts .env file (the sole config mechanism confirmed in use repo-wide; grep for FLEET_.*_ENABLED across .env* confirms this is the established pattern, not a new mechanism). Rollback is deleting/commenting that line and confirming inertness, not a database or dashboard toggle.';
fr2.acceptance_criteria.push('FLEET_CONSOLE_REAPER_ENABLED=on is added as a line to the fleet hosts .env file (the same mechanism every other FLEET_*_ENABLED flag in this codebase already uses) -- not a new/different config mechanism; rollback is removing that line and re-confirming inertness');

let sa = typeof prd.system_architecture === 'string' ? JSON.parse(prd.system_architecture) : prd.system_architecture;
const idx = sa.components.findIndex((c) => String(c.name).startsWith('lib/coordinator/adam-identity.cjs'));
if (idx >= 0) {
  sa.components[idx] = { name: 'server/routes/fleet-actions.js', change: 'route-local staleness check calling fetchAllAdamsStrict/fetchAllSolomonsStrict directly; getActiveAdamId/getActiveSolomonId themselves are UNCHANGED (FR-1, round-2 decided scope)' };
}

// Global acceptance_criteria: explicitly reference the FR-1/FR-2 proof styles the critique
// said were missing from the top-level list (previously only "all FR criteria pass").
const ac = Array.isArray(prd.acceptance_criteria) ? [...prd.acceptance_criteria] : [];
if (!ac.some((c) => c.includes('screenshot'))) {
  ac.push('FR-1s UI proof (screenshot/capture of the amber stale-holder line) and FR-2s host-level proof (schtasks registration + rollback) are each satisfied on their own terms, not merely implied by "all FR criteria pass"');
}

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs, system_architecture: JSON.stringify(sa), acceptance_criteria: ac })
  .eq('sd_id', SD_ID);
if (updErr) { console.error('PRD update failed', updErr); process.exit(1); }
console.log('PRD round-2 corrected: resolver location decided (route-local), env-var mechanism named (.env), global AC references FR-1/FR-2 proof styles.');
