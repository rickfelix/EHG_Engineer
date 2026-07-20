#!/usr/bin/env node
/**
 * audit-venture-design-pass.mjs — SD-LEO-INFRA-FLEET-WIDE-AUDIT-001
 *
 * Classifies every real (build_model='leo_bridge') venture by build_state and design_pass,
 * scoping the MarketLens-class defect's true blast radius. Idempotently upserts
 * venture_design_pass_ledger on every run (current-state snapshot, not a history log).
 *
 * venture_type is NOT used to determine whether a venture has a landing (DataDistill/CronGenius
 * are labeled 'backend' but both ship real marketing-site UI) -- design_pass is derived from
 * structural repo evidence (a dedicated marketing/site component directory) plus stitch_*
 * artifacts / a persisted design-fidelity score, none of which exist live today. A completed
 * child SD is NEVER used to flip design_pass (MarketLens's own completed children ARE the
 * original defect-producing build, not a fix).
 *
 * Usage: node scripts/audit-venture-design-pass.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: this audit's whole purpose is
// complete portfolio coverage ("scoping the true blast radius") — a silently-capped ventures
// read would undermine exactly that. Paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

export const CLASSIFIER_VERSION = '1.0.0';

/** Directory names that indicate real, named marketing/site UI investment beyond the bare
 *  framework scaffold (routeTree.gen.ts + a bare index route alone do not count). */
const SITE_COMPONENT_DIRS = ['components/site', 'components/marketing', 'components/landing'];

function countGitCommits(repoPath) {
  if (!repoPath || !existsSync(repoPath)) return null;
  try {
    const out = execFileSync('git', ['log', '--oneline'], { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

function hasStructuralSiteUi(repoPath) {
  if (!repoPath) return false;
  for (const rel of SITE_COMPONENT_DIRS) {
    const dir = path.join(repoPath, 'src', rel);
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir).filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
        if (files.length > 0) return true;
      } catch { /* unreadable -> not counted */ }
    }
  }
  return false;
}

/**
 * build_state from the build_mvp_build artifact (the authoritative DB signal for "was this
 * venture built"), corroborated by repo/commit evidence. Two genuine-ambiguity cases both
 * yield insufficient_evidence rather than a guess: (a) real committed code exists with no
 * recorded build artifact (a contradiction), and (b) the repo directory is entirely absent, so
 * there is no way to confirm whether it was ever built and later removed, or never built at
 * all -- this is NOT the same evidentiary state as a repo that verifiably EXISTS with zero
 * commits (that case is latent: confirmed never-built).
 */
function classifyBuildState({ hasBuildArtifact, commitCount, repoExists }) {
  if (hasBuildArtifact) return 'realized';
  if (commitCount != null && commitCount > 0) return 'insufficient_evidence'; // contradiction: real code, no recorded build
  if (repoExists) return 'latent'; // repo confirmed present with zero commits -> genuinely never built
  return 'insufficient_evidence'; // repo directory absent entirely -> cannot confirm either way
}

/** design_pass from the currently-live-operative signal set (TR-3). */
function classifyDesignPass({ buildState, structuralUi, stitchCount, designFidelityScore }) {
  if (buildState !== 'realized') return { design_pass: 'insufficient_evidence', evidence_basis: 'none' };
  if (designFidelityScore != null) return { design_pass: 'yes', evidence_basis: 'design_fidelity_score' };
  if (stitchCount > 0) return { design_pass: 'yes', evidence_basis: 'stitch_artifact' };
  if (structuralUi) return { design_pass: 'yes', evidence_basis: 'structural_ui' };
  return { design_pass: 'no', evidence_basis: 'none' };
}

function classifyDisposition({ buildState, designPass }) {
  // buildState decides first: a latent venture's design_pass is a structural
  // 'insufficient_evidence' placeholder (not yet applicable), not a genuine ambiguity --
  // checking buildState before designPass avoids that placeholder masking latent_at_risk.
  if (buildState === 'insufficient_evidence') return 'insufficient_evidence';
  if (buildState === 'latent') return 'latent_at_risk';
  if (designPass === 'insufficient_evidence') return 'insufficient_evidence';
  return designPass === 'yes' ? 'realized_design_pass_confirmed' : 'realized_defect';
}

/** Pure classification given all inputs -- exported for unit testing without DB/filesystem IO. */
export function classifyVenture(input) {
  const build_state = classifyBuildState(input);
  const { design_pass, evidence_basis } = classifyDesignPass({ buildState: build_state, ...input });
  const disposition = classifyDisposition({ buildState: build_state, designPass: design_pass });
  return { build_state, design_pass, evidence_basis, disposition };
}

async function fetchArtifactEvidence(supabase, ventureId) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, created_at')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['build_mvp_build']);
  const rows = data || [];
  const buildTimestamps = rows.map((r) => parseAsUtcMs(r.created_at)).filter(Number.isFinite);
  const { count: stitchCount } = await supabase
    .from('venture_artifacts')
    .select('artifact_type', { count: 'exact', head: true })
    .eq('venture_id', ventureId)
    .like('artifact_type', 'stitch%');
  return {
    hasBuildArtifact: rows.length > 0,
    // Earliest recorded build -- the anchor a remediation SD must postdate to count as a fix,
    // not the original defect-producing build (TR-6).
    buildAnchorMs: buildTimestamps.length ? Math.min(...buildTimestamps) : null,
    stitchCount: stitchCount || 0,
  };
}

/** Title fragments that plausibly indicate a design/landing remediation effort (TR-6). Deliberately
 *  narrow -- a venture can have dozens of unrelated linked SDs (DataDistill alone has 73), so the
 *  predicate must be selective, not merely "any child SD". */
const REMEDIATION_TITLE_PATTERN = /rebuild|remediation|redesign/i;

/**
 * strategic_directives_v2.created_at is `timestamp WITHOUT time zone` (DATABASE row cfa8e1fd,
 * DB-C1) while venture_artifacts.created_at is `timestamptz` -- an ISO string with no timezone
 * designator parses as LOCAL time under Date.parse(), not UTC, silently misfiring the anchor
 * comparison near day boundaries. This column is UTC-intended but tz-naive; normalize explicitly.
 */
function parseAsUtcMs(isoLike) {
  if (!isoLike) return NaN;
  const hasTzDesignator = /[zZ]|[+-]\d\d:?\d\d$/.test(isoLike);
  return Date.parse(hasTzDesignator ? isoLike : `${isoLike}Z`);
}

/**
 * TR-6: remediation_status is informational only and NEVER overrides build_state/design_pass/
 * disposition. Requires a real build anchor to evaluate against (a latent venture with no
 * build_mvp_build artifact has nothing to remediate yet -> not_applicable). Postdating the
 * anchor (both sides normalized to UTC epoch ms) distinguishes an actual fix attempt from the
 * original defect-producing build itself (the bug TESTING caught in this SD's own first draft).
 *
 * KNOWN LIMITATION (discovered live): this can only find remediation SDs properly linked via
 * strategic_directives_v2.venture_id. MarketLens's own real remediation SD,
 * SD-LEO-FEAT-MARKETLENS-LANDING-REBUILD-001, has venture_id=NULL (linked only by title text),
 * so it returns 'none_found' here despite existing. Not fixed by matching on title text against
 * a venture name -- that reintroduces the same unreliable-heuristic class this SD's own FR-4 fix
 * removed. The underlying gap (remediation SDs not consistently venture_id-linked) is a fleet
 * SD-creation convention issue, out of scope for this audit.
 */
async function classifyRemediationStatus(supabase, ventureId, buildAnchorMs) {
  if (buildAnchorMs == null) return 'not_applicable';
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('status, title, created_at')
    .eq('venture_id', ventureId)
    .not('parent_sd_id', 'is', null);
  const candidates = (data || []).filter((sd) => {
    const createdMs = parseAsUtcMs(sd.created_at);
    return REMEDIATION_TITLE_PATTERN.test(sd.title || '') && Number.isFinite(createdMs) && createdMs > buildAnchorMs;
  });
  if (candidates.some((sd) => sd.status === 'completed')) return 'remediation_completed';
  if (candidates.length > 0) return 'remediation_in_progress';
  return 'none_found';
}

export async function runAudit({ supabase, dryRun = false } = {}) {
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, status, build_model')
      .eq('build_model', 'leo_bridge')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) {
    throw new Error(`ventures query failed: ${e.message}`);
  }

  const { data: apps } = await supabase.from('applications').select('venture_id, local_path');
  const localPathByVenture = new Map((apps || []).map((a) => [a.venture_id, a.local_path]));

  const results = [];
  for (const v of ventures || []) {
    const repoPath = localPathByVenture.get(v.id) || null;
    const repoExists = !!repoPath && existsSync(repoPath);
    const commitCount = repoExists ? countGitCommits(repoPath) : null;
    const structuralUi = repoExists && hasStructuralSiteUi(repoPath);
    const { hasBuildArtifact, buildAnchorMs, stitchCount } = await fetchArtifactEvidence(supabase, v.id);

    const classification = classifyVenture({
      hasBuildArtifact,
      commitCount,
      repoExists,
      structuralUi,
      stitchCount,
      designFidelityScore: null, // scorer is dormant fleet-wide; no persisted scores exist
    });
    const remediation_status = await classifyRemediationStatus(supabase, v.id, buildAnchorMs);

    const row = {
      venture_id: v.id,
      venture_name: v.name,
      build_path: v.build_model,
      ...classification,
      is_cancelled: v.status === 'cancelled',
      remediation_status,
      evidence_detail: { repoPath, repoExists, commitCount, structuralUi, stitchCount, hasBuildArtifact },
      classifier_version: CLASSIFIER_VERSION,
      classifier_run_at: new Date().toISOString(),
    };
    results.push(row);
  }

  if (!dryRun) {
    const { error: upsertErr } = await supabase
      .from('venture_design_pass_ledger')
      .upsert(results, { onConflict: 'venture_id' });
    if (upsertErr) throw new Error(`ledger upsert failed: ${upsertErr.message}`);
  }

  // FR-1/AC-8: orphaned applications rows (no linked venture) cannot be classified against the
  // ventures ledger at all -- surfaced as a separate result set, never merged in or dropped.
  const { data: orphanedApps } = await supabase
    .from('applications')
    .select('name, local_path')
    .is('venture_id', null);

  return { results, orphanedApplications: orphanedApps || [] };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { results, orphanedApplications } = await runAudit({ supabase, dryRun });

  const byDisposition = {};
  for (const r of results) byDisposition[r.disposition] = (byDisposition[r.disposition] || 0) + 1;

  console.log(`\nFleet-Wide Venture Design-Pass Audit${dryRun ? ' (dry-run)' : ''}`);
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`  ${r.venture_name.padEnd(24)} ${r.disposition.padEnd(28)} (${r.evidence_basis}, cancelled=${r.is_cancelled}, remediation=${r.remediation_status})`);
  }
  console.log('-'.repeat(60));
  console.log('Disposition summary:', JSON.stringify(byDisposition));
  const realizedDefects = results.filter((r) => r.disposition === 'realized_defect');
  console.log(`\nrealized_defect count (the one-off-vs-fleet-wide answer): ${realizedDefects.length}`);
  console.log(`  -> ${realizedDefects.map((r) => r.venture_name).join(', ')}`);

  console.log(`\nOrphaned applications (no linked venture, not part of the ventures ledger): ${orphanedApplications.length}`);
  for (const a of orphanedApplications) console.log(`  ${a.name.padEnd(24)} ${a.local_path || '(no local_path)'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
