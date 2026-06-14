#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 — FR-1: deterministic CLAUDE_*.md drift-check
 * primitive (content-aware per-section digest).
 *
 * The generated CLAUDE_*.md family is produced from the leo_protocol_sections DB table by
 * scripts/generate-claude-md-from-db.js. Nothing detected when a section's CONTENT changed in
 * the DB but the files were not regenerated+committed, so every session could silently load
 * stale protocol prose.
 *
 * WHY A SECTION DIGEST (not a render-diff, not the db_snapshot_hash):
 *  - The generator's db_snapshot_hash hashes section COUNT (+ subagent count + telemetry
 *    hashes), NOT section content — a content edit to an existing section is invisible to it.
 *  - The rendered CLAUDE_*.md files embed VOLATILE live telemetry (hotPatterns, gateHealth,
 *    recentRetrospectives, pendingProposals, frictionPoints, visionGaps) + Generated
 *    timestamps, which churn independently of protocol content — so a regenerate-and-diff of
 *    the rendered files is false-positive-prone (it would report "drift" every time a gate
 *    runs). Verified live 2026-06-14.
 *  - The actionable drift is: a leo_protocol_sections row's CONTENT changed but the docs were
 *    not regenerated. computeSectionDigests() (in the generator module, the SINGLE source of
 *    the hashing logic) hashes only the stable rendering fields and is written to the manifest
 *    at generation time. This primitive recomputes it from the live DB and compares.
 *
 * Exit codes: 0 = clean, 1 = DRIFT (stale sections/files named), 2 = internal error (callers
 * should fail-open on 2 — a DB/infra blip must never block a commit or a session).
 *
 * Reused by: FR-2 pre-commit gate, FR-3 SessionStart warning, FR-4a CI PR check.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Best-effort env load (cwd .env). In worker sessions / CI the env is already injected;
// if SUPABASE creds are absent computeDrift() throws and the caller fail-opens (exit 2).
try { require('dotenv').config(); } catch { /* dotenv optional */ }

const SCRIPTS_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, '..');
const GENERATOR_URL = pathToFileURL(path.join(SCRIPTS_DIR, 'modules', 'claude-md-generator', 'index.js')).href;
const DBQ_URL = pathToFileURL(path.join(SCRIPTS_DIR, 'modules', 'claude-md-generator', 'db-queries.js')).href;
const manifestPathFor = (baseDir) => path.join(baseDir, 'claude-generation-manifest.json');

/**
 * Pure comparison of two section-digest maps (live DB vs manifest). No I/O, no DB —
 * unit-testable in isolation.
 * @param {{ byId:Object, meta?:Object, global?:string }} live
 * @param {{ byId:Object, meta?:Object, global?:string }} stored
 * @returns {{ drift:boolean, changed:Array, added:Array, removed:Array, staleFiles:string[], globalMatch:boolean }}
 */
function diffSectionDigests(live, stored) {
  const liveSet = new Set(Object.keys(live.byId || {}));
  const storedSet = new Set(Object.keys(stored.byId || {}));
  const changed = [];
  const added = [];
  const removed = [];
  for (const id of liveSet) {
    if (!storedSet.has(id)) added.push(id);
    else if (live.byId[id] !== stored.byId[id]) changed.push(id);
  }
  for (const id of storedSet) if (!liveSet.has(id)) removed.push(id);

  const staleFiles = new Set();
  const describe = (id, metaSource) => {
    const m = (metaSource && metaSource[id]) || {};
    if (m.target_file) staleFiles.add(m.target_file);
    return { id, section_type: m.section_type || null, target_file: m.target_file || null, title: m.title || null };
  };
  const changedD = changed.map((id) => describe(id, live.meta));
  const addedD = added.map((id) => describe(id, live.meta));
  const removedD = removed.map((id) => describe(id, stored.meta));
  const globalMatch = (live.global || null) === (stored.global || null);
  const contentDrift = changed.length + added.length + removed.length > 0;
  // A pure REORDER (same sections + content, different render order) leaves byId untouched but
  // flips the render-order `global` hash — still real drift (the rendered bytes differ).
  const orderChanged = !globalMatch && !contentDrift;
  return {
    drift: contentDrift || !globalMatch,
    changed: changedD,
    added: addedD,
    removed: removedD,
    staleFiles: [...staleFiles],
    globalMatch,
    orderChanged,
  };
}

/**
 * Compare the live leo_protocol_sections content digests against the digests stored in
 * claude-generation-manifest.json at the last generation.
 * @param {{ baseDir?: string }} [opts] baseDir defaults to the repo root that owns this script.
 * @returns {Promise<{ status:string, drift:boolean, changed:Array, added:Array, removed:Array, staleFiles:string[], note?:string }>}
 */
async function computeDrift({ baseDir = REPO_ROOT } = {}) {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot read leo_protocol_sections');
  }
  const supabase = createClient(url, key);

  const { computeSectionDigests } = await import(GENERATOR_URL);
  const { getActiveProtocol } = await import(DBQ_URL);

  const protocol = await getActiveProtocol(supabase);
  const live = computeSectionDigests(protocol.sections);

  const manifestPath = manifestPathFor(baseDir);
  if (!fs.existsSync(manifestPath)) {
    return { status: 'no_manifest', drift: true, changed: [], added: [], removed: [], staleFiles: [], note: 'claude-generation-manifest.json missing — run the generator' };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { status: 'bad_manifest', drift: true, changed: [], added: [], removed: [], staleFiles: [], note: 'manifest unparseable — regenerate' };
  }

  const stored = manifest.section_digests;
  if (!stored || !stored.byId) {
    return { status: 'no_section_digests', drift: true, changed: [], added: [], removed: [], staleFiles: [], note: 'manifest predates the drift guard (no section_digests) — regenerate to enable drift tracking' };
  }

  return { status: 'ok', ...diffSectionDigests(live, stored) };
}

async function main() {
  try {
    const r = await computeDrift();
    if (!r.drift) {
      console.log('OK no drift — generated CLAUDE_*.md match leo_protocol_sections (section digests aligned)');
      process.exit(0);
    }
    console.error('DRIFT generated protocol docs are STALE vs leo_protocol_sections.');
    if (r.note) console.error('   ' + r.note);
    const fmt = (d) => `${d.title || d.section_type || d.id}${d.target_file ? ' -> ' + d.target_file : ''}`;
    if (r.changed.length) { console.error(`   Changed sections (${r.changed.length}):`); r.changed.forEach((d) => console.error('     ~ ' + fmt(d))); }
    if (r.added.length) { console.error(`   New sections (${r.added.length}):`); r.added.forEach((d) => console.error('     + ' + fmt(d))); }
    if (r.removed.length) { console.error(`   Removed sections (${r.removed.length}):`); r.removed.forEach((d) => console.error('     - ' + fmt(d))); }
    if (r.orderChanged) console.error('   Section ORDER changed (same content, different render order) — rendered output differs.');
    if (r.staleFiles.length) console.error('   Stale files: ' + r.staleFiles.join(', '));
    console.error('\n   Fix: node scripts/generate-claude-md-from-db.js   (then commit the regenerated files)');
    process.exit(1);
  } catch (err) {
    console.error(`check-claude-md-drift: INTERNAL ERROR (fail-open) — ${err && err.message}`);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = { computeDrift, diffSectionDigests };
