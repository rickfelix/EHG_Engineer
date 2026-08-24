#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001';

// LEAD-phase enrichment: metadata.needs_enrichment flagged key_changes, strategic_objectives,
// risks as missing on this auto-created (leo-create-sd --from-plan) SD row. Filled from a
// coordinator-dispatched research swarm (entrypoint-census, venture-repo-census,
// venture-inventory, sd-overlap-search agents) that independently investigated this SD's exact
// scope and surfaced two load-bearing structural risks the SD's own problem statement did not
// anticipate -- both baked into risks[] below rather than discovered mid-EXEC.

const key_changes = [
  { change: 'FR-1: vendor deploy.yml + ci.yml + a stack-scan-equivalent workflow + feedback/error-reporting modules as versioned templates in EHG_Engineer, stamped into a venture repo AT PROVISIONING. Source deploy.yml FROM altifyai\'s origin/main (NOT its local worktree checkout, which is 70 commits stale and missing the file entirely) -- confirmed the only genuinely hardened deploy workflow across all 18 sampled venture repos (concurrency guard, post-build secret-bake verification, DB migration step, live-URL fail-loud check, config-drift guard, post-deploy signed-in UAT probe, log redaction on failure).', type: 'feature' },
  { change: 'FR-1: no existing venture repo has a canonical feedback/error-reporting module to copy verbatim -- shapes found range from client-only (apexniche-ai) to client+server (altifyai, marketlens has the fullest stack) to a Lovable-platform error-reporting file (datadistill) to nothing at all (11 of 18 repos). The vendored module must be a fresh, unified design, not a copy of any one venture\'s existing implementation.', type: 'feature' },
  { change: 'FR-2: build-gate requiring a pinned-version manifest file, hooked at BOTH real provisioning entry points (see risks -- venture creation is NOT a single chokepoint), plus explicit non-interference with the existing standalone self-heal call to ensureLeoBridgeScaffold() (lib/eva/stage-execution-worker.js:702-703), which is deliberately NOT gated behind provisionVenture() today.', type: 'feature' },
  { change: 'FR-3: backfill census covering the full live venture-repo population (confirmed via GitHub: ~44 non-infra-pattern repos under rickfelix, not just the 5-repo sample cited in the SD\'s own problem statement) -- report scaffold presence/version per repo; PROPOSE backfill per-venture, never auto-apply.', type: 'feature' },
  { change: 'FR-4: registry tie-in must specify explicitly WHICH registry it writes to -- applications/registry.json (file, 13 entries) and the DB applications table (15 rows, 9 active) are TWO DIFFERENT, only-partially-overlapping datasets today, not one canonical registry as the SD\'s problem statement assumes.', type: 'feature' },
];

const strategic_objectives = [
  'Stop the venture-provisioning factory from stamping prose instructions instead of enforceable infrastructure -- confirmed true at 0/18 sampled venture repos carrying any stack-scan-named CI workflow (stronger than the SD\'s own 0/5 claim) and 0/18 carrying any scaffold manifest file.',
  'Close the ApexNiche-class failure (stranded feedback module, missing registry entry) by tying scaffold presence and registry registration to the SAME provisioning step, so a venture cannot go live partially wired.',
  'Make the platform contract structural rather than aspirational: a fleet consumer census (FR-3) becomes possible going forward because a manifest now exists to census against -- today nothing ties ventures to the platform contract at all.',
];

const risks = [
  { risk: 'Venture provisioning is NOT a single chokepoint. A coordinator-dispatched entrypoint census found TWO structurally divergent, both first-class production paths: (1) buildModel=leo_bridge routes through provisionVenture() (lib/eva/bridge/venture-provisioner.js:832, sole production call site at lib/eva/stage-execution-worker.js:1922/3861); (2) buildModel=seeded_repo BYPASSES provisionVenture entirely, going through server/routes/github-repo.js:60-83 (POST /api/github/create-and-seed -> raw `gh repo create` + a DIFFERENT seeding function, replit-repo-seeder.js::seedRepo()). A build-gate hooking only provisionVenture() would silently miss every seeded_repo venture. No caller for the create-and-seed route was found in this repo -- it is likely driven by a separate EHG frontend app not present in this worktree, which must be checked before FR-2 is scoped as a single hook.', mitigation: 'FR-2 must name BOTH entry points explicitly as in-scope hook points (or hook at a lower shared layer if one can be introduced), and PLAN must verify the create-and-seed caller/frontend before finalizing the gate design.' },
  { risk: '"The applications registry" is not one thing. applications/registry.json (file, in this repo, 13 entries, all status=active including several test fixtures) and the DB applications table (15 rows, 9 active, 6 inactive) are DIFFERENT datasets that only partially overlap -- e.g. EHG_Engineer/PrivacyPatrol AI/CronRead/CronGenius exist in the DB table but not the file; test-leo-project/test-venture/e2e-verdict-engine-* fixtures exist in the file but not the DB table. FR-4\'s "registry tie-in" as originally scoped assumes a single write target.', mitigation: 'PLAN must pick (or explicitly reconcile) ONE registry as FR-4\'s write target and document why, rather than silently picking one and leaving the other to drift further. A DB view, vw_venture_registry, already exists as a 9-row active-only projection of the DB applications table -- worth evaluating as the canonical read-side surface FR-3\'s census reports against.' },
  { risk: 'No manifest format precedent exists anywhere in the fleet (checked all 18 sampled repos, disk and altifyai\'s origin/main) -- FR-2\'s "manifest file names the scaffold version" is fully greenfield, not an existing-pattern extension, so its schema/location/versioning scheme is a real design decision, not a lookup.', mitigation: 'Design the manifest format explicitly in the PRD (not deferred to EXEC), keeping it minimal (scaffold version + stamped-at timestamp) to reduce the surface a future scaffold-version bump has to touch across every venture repo.' },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMeta = { ...(sd.metadata || {}) };
delete newMeta.needs_enrichment;

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, strategic_objectives, risks, metadata: newMeta })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('LEAD enrichment written for SD', sd.id);
