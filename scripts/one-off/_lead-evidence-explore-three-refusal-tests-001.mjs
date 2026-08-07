#!/usr/bin/env node
/**
 * One-off: record Explore LEAD-phase evidence for SD-LEO-INFRA-THREE-REFUSAL-TESTS-001.
 *
 * The Explore sub-agent ran read-only (it cannot write to the DB by construction), so this
 * script records its returned survey verdict through the canonical writer rather than a
 * hand-rolled insert (CLAUDE.md prologue rule 11: metadata.repo_path + executed_from_cwd via
 * lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict; there are NO top-level repo_path
 * columns).
 *
 * Survey question: how widespread is the `opts.X ?? process.env.Y` pattern that makes the three
 * refusal tests take their verdict from operator .env? Answer: the call-site pattern is narrow,
 * but the ENV-ISOLATION gap underneath it is suite-level, which is what decides the fix shape.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '581a0da1-331a-4429-9969-a45667df076f';
const SD_KEY = 'SD-LEO-INFRA-THREE-REFUSAL-TESTS-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 88,
    findings: [
      {
        id: 'F1-root-cause-is-suite-level-env-leak-not-three-call-sites',
        severity: 'HIGH',
        summary: "vitest.config.js:16-17 unconditionally loadEnv('.env') + loadEnv('.env.test') in the PARENT process at config-evaluation time, and pool:'forks' (vitest.config.js:166) means every forked worker INHERITS that process.env. tests/setup.unit.js deliberately does NOT call dotenv.config() (comment: 'unit tests must not reach the live DB'), but that is moot -- the real .env is already present in each fork before setup runs. This single gap explains the three refusal-test failures AND the separately-red tests/unit/setup/env-isolation-guard.test.js.",
      },
      {
        id: 'F2-precedent-exists-for-the-fix-in-the-same-file',
        severity: 'INFO',
        summary: "vitest.config.js:219 already defines a unit-project-level env override neutralizing FLEET_REPO_ROOT to './tests/fixtures/__no_such_tree__'. That is exactly the mechanism needed here, already proven in-repo -- it simply does not cover FLEET_ACCOUNT_PROFILES_DIR, FLEET_SPAWN_CONTROL_LIVE, FLEET_BROWSER_PROFILES_DIR or FLEET_CANARY_KILL_ENABLED. Argues for extending an existing pattern, not inventing one.",
      },
      {
        id: 'F3-call-site-inventory-pattern-A-and-B',
        severity: 'MEDIUM',
        summary: "Pattern A (opts.X ?? process.env.Y, X may legitimately be null meaning absent): lib/fleet/spawn-control.js:103, lib/fleet/browser-control.js:42, lib/fleet/build-session-launch.cjs:57 (ternary near-variant), lib/programmatic/tools/ollama-tool.js:27-28, lib/eva/stage-17/qa-rubric.js:276. Pattern B (indirect -- helper internally defaults to process.env, called with ZERO args so an explicit opts.env is bypassed): lib/fleet/spawn-control.js:227 and lib/fleet/reboot-respawn-runner.js:182, both `opts.live ?? isLiveEnabled()`. Pattern C (opts.env || process.env, ~17 sites) is SAFE -- it swaps the whole env object so a test retains full control; excluded from the blast radius.",
      },
      {
        id: 'F4-live-blast-radius-is-two-vars-today',
        severity: 'MEDIUM',
        summary: "Intersection of the opts-fallback consumers with vars actually SET in this repo's .env (no .env.test/.env.local exist): FLEET_ACCOUNT_PROFILES_DIR (.env:183) and FLEET_SPAWN_CONTROL_LIVE=true (.env:186). Those two are the entire live blast radius. FLEET_BROWSER_PROFILES_DIR is UNSET today, so tests/unit/fleet/browser-control.test.js:108 ('not configured' throw) currently passes -- but it has zero protection and is the same latent shape, i.e. it would break silently for any operator who exports that var.",
      },
      {
        id: 'F5-author-already-knew-locally-sibling-test-self-protects',
        severity: 'INFO',
        summary: "tests/unit/fleet/spawn-control.test.js:181-203 ('throws if no base dir is configured') explicitly deletes process.env.FLEET_ACCOUNT_PROFILES_DIR and restores it in a finally, with a comment naming the exact leak ('Pre-existing env leakage... neutralize it for the duration of this one assertion'). The sibling refusal test at :882 does not. tests/unit/eva/imagen-logo-renderer.test.js:70-101 does the same save/delete/restore for GEMINI_API_KEY. So the correct per-test idiom already exists in-repo and was applied inconsistently -- further evidence the durable fix belongs at the suite level, not in three more hand-rolled save/restore blocks.",
      },
      {
        id: 'F6-env-isolation-guard-red-for-the-same-root-cause',
        severity: 'HIGH',
        summary: "tests/unit/setup/env-isolation-guard.test.js asserts process.env.SUPABASE_URL === 'https://test.invalid.local', the synthetic sentinel set by tests/setup.unit.js:15 via ||=. Because the parent-process .env load leaks the REAL SUPABASE_URL (.env:5) into every fork, the ||= sees a truthy value and never overwrites it, so the assertion fails against the real URL. Same root cause as the three refusal tests, manifesting through a ||= sentinel instead of a ?? opts-fallback -- confirms the gap is architectural, not incidental.",
      },
    ],
    metadata: {
      survey_scope: 'lib/ and scripts/, excluding node_modules, archive/, and other worktrees',
      counts: { pattern_A_direct: 5, pattern_B_indirect_via_helper: 2, pattern_C_whole_env_swap_safe: 17, live_blast_radius_vars: 2 },
      recommended_fix_shape: 'Suite-level: strip/neutralize operator-set FLEET_* (and the SUPABASE_URL sentinel path) for the unit vitest project, extending the existing vitest.config.js:219 FLEET_REPO_ROOT override precedent. NOT: editing the three fenced refusal assertions, and NOT: loosening the source guards.',
      binding_ruling_honored: 'Read-only survey. No test edited, no source edited.',
      recorded_by: 'Alpha-4 (worker session 39aa8a1e) on behalf of the read-only Explore sub-agent, which cannot write to the DB by construction. Findings are the Explore agent’s returned survey, not a re-derivation.',
    },
    phase: 'LEAD',
    summary: "PASS for LEAD-TO-PLAN. Survey answers the scoping question the determination raised: the `opts.X ?? process.env.Y` CALL-SITE pattern is narrow (5 direct + 2 indirect via isLiveEnabled(), plus 1 ternary near-variant), and only 2 of those env vars (FLEET_ACCOUNT_PROFILES_DIR, FLEET_SPAWN_CONTROL_LIVE) are live-blast on this host -- but the ROOT CAUSE is one level up and architectural: vitest.config.js:16-17 loads the real .env into the parent process and pool:'forks' inherits it into every unit worker, so tests/setup.unit.js's ||= sentinels never fire. That same gap independently breaks tests/unit/setup/env-isolation-guard.test.js (SUPABASE_URL sentinel). A fix precedent already exists in the same file (vitest.config.js:219 neutralizes FLEET_REPO_ROOT for the unit project) and simply needs extending. Conclusion for PLAN: scope the fix at the suite/env-isolation level rather than patching three call sites or editing three fenced assertions.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore (read-only survey sub-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('Explore result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
