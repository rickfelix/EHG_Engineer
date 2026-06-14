#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-2): pre-commit source gate.
 *
 * Blocks a commit that STAGES changes to the generated-doc family (CLAUDE_*.md, the manifest,
 * the generator, or the section mapping) while those committed docs have drifted from the live
 * leo_protocol_sections DB — i.e. a partial / stale regeneration. This stops drift from reaching
 * main at the change. CI (FR-4a) is the un-bypassable backstop; this is the fast local catch.
 *
 * Scoped: only runs the (DB-touching) drift check when the commit actually touches the
 * generated-doc family, so unrelated commits pay no cost and are never blocked by ambient drift.
 * Fail-open: any inability to determine drift (no DB creds, transient error, missing primitive)
 * exits 0. Override with LEO_DOC_DRIFT_GATE=off.
 *
 * Exit: 0 = allow, 1 = block (real drift on a doc-family commit).
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const TRIGGER = [
  /^CLAUDE[^/]*\.md$/,
  /^claude-generation-manifest\.json$/,
  /^scripts\/generate-claude-md-from-db\.js$/,
  /^scripts\/check-claude-md-drift\.cjs$/,
  /^scripts\/modules\/claude-md-generator\//,
  /^scripts\/section-file-mapping.*\.json$/,
];

async function run() {
  if (String(process.env.LEO_DOC_DRIFT_GATE || '').toLowerCase() === 'off') return 0;

  let staged = [];
  try {
    staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  } catch {
    return 0; // cannot list staged files → fail-open
  }
  const relevant = staged.some((f) => TRIGGER.some((re) => re.test(f)));
  if (!relevant) return 0; // commit does not touch the generated-doc family — skip (no DB call)

  let computeDrift;
  try {
    ({ computeDrift } = require(path.join(__dirname, '..', 'check-claude-md-drift.cjs')));
  } catch {
    return 0; // drift primitive unavailable → fail-open
  }

  let r;
  try {
    r = await computeDrift();
  } catch {
    return 0; // DB / infra error → fail-open (never block a commit on infra)
  }

  if (r && r.drift) {
    const n = (r.changed?.length || 0) + (r.added?.length || 0) + (r.removed?.length || 0);
    const files = (r.staleFiles || []).filter(Boolean).join(', ');
    console.error('');
    console.error('BLOCKED: CLAUDE_*.md drift vs leo_protocol_sections (FR-2 source gate)');
    console.error(`   ${n} section change(s) not regenerated${files ? ` — stale: ${files}` : ''}.`);
    console.error('   Fix: node scripts/generate-claude-md-from-db.js   (then stage the regenerated files + recommit)');
    console.error('   Override (rare/infra): LEO_DOC_DRIFT_GATE=off git commit ...');
    console.error('');
    return 1;
  }
  return 0;
}

run()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0)); // belt-and-suspenders fail-open
