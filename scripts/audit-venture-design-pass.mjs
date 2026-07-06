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
 * venture built"). Repo/commit evidence is a secondary corroboration, used to flag the one
 * genuine contradiction (no build artifact recorded, yet real committed code exists) rather
 * than to independently derive the verdict -- a missing/absent local clone is NOT itself
 * contradictory (the artifact remains the stronger, DB-persisted signal).
 */
function classifyBuildState({ hasBuildArtifact, commitCount }) {
  if (hasBuildArtifact) return 'realized';
  if (commitCount != null && commitCount > 0) return 'insufficient_evidence'; // contradiction: real code, no recorded build
  return 'latent';
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
    .select('artifact_type')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['build_mvp_build', 's17_approved']);
  const rows = data || [];
  const { count: stitchCount } = await supabase
    .from('venture_artifacts')
    .select('artifact_type', { count: 'exact', head: true })
    .eq('venture_id', ventureId)
    .like('artifact_type', 'stitch%');
  return {
    hasBuildArtifact: rows.some((r) => r.artifact_type === 'build_mvp_build'),
    stitchCount: stitchCount || 0,
  };
}

export async function runAudit({ supabase, dryRun = false } = {}) {
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, status, build_model')
    .eq('build_model', 'leo_bridge');
  if (error) throw new Error(`ventures query failed: ${error.message}`);

  const { data: apps } = await supabase.from('applications').select('venture_id, local_path');
  const localPathByVenture = new Map((apps || []).map((a) => [a.venture_id, a.local_path]));

  const results = [];
  for (const v of ventures || []) {
    const repoPath = localPathByVenture.get(v.id) || null;
    const repoExists = !!repoPath && existsSync(repoPath);
    const commitCount = repoExists ? countGitCommits(repoPath) : null;
    const structuralUi = repoExists && hasStructuralSiteUi(repoPath);
    const { hasBuildArtifact, stitchCount } = await fetchArtifactEvidence(supabase, v.id);

    const classification = classifyVenture({
      hasBuildArtifact,
      commitCount,
      repoExists,
      structuralUi,
      stitchCount,
      designFidelityScore: null, // scorer is dormant fleet-wide; no persisted scores exist
    });

    const row = {
      venture_id: v.id,
      venture_name: v.name,
      build_path: v.build_model,
      ...classification,
      is_cancelled: v.status === 'cancelled',
      remediation_status: 'not_applicable', // TR-6: timing-based remediation detection is a separate, informational pass
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

  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const results = await runAudit({ supabase, dryRun });

  const byDisposition = {};
  for (const r of results) byDisposition[r.disposition] = (byDisposition[r.disposition] || 0) + 1;

  console.log(`\nFleet-Wide Venture Design-Pass Audit${dryRun ? ' (dry-run)' : ''}`);
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`  ${r.venture_name.padEnd(24)} ${r.disposition.padEnd(28)} (${r.evidence_basis}, cancelled=${r.is_cancelled})`);
  }
  console.log('-'.repeat(60));
  console.log('Disposition summary:', JSON.stringify(byDisposition));
  const realizedDefects = results.filter((r) => r.disposition === 'realized_defect');
  console.log(`\nrealized_defect count (the one-off-vs-fleet-wide answer): ${realizedDefects.length}`);
  console.log(`  -> ${realizedDefects.map((r) => r.venture_name).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
