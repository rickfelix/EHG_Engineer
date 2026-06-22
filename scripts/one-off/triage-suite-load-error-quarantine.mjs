/**
 * SD-REFILL-00CO4E8Q — triage the 36 'suite-load-error' quarantine entries.
 *
 * Two populations:
 *   - DEAD: target module gone / docs/archived orphan path / no test calls -> DELETE the file.
 *   - VALID node:test: imports from 'node:test' and has test calls (pass under `node --test`)
 *     but vitest can't load node:test suites -> RECLASSIFY reason_class to 'node-test-runner'
 *     (NOT deleted; stays excluded from vitest by design).
 *
 * Rewrites tests/quarantine-manifest.json: prune deleted entries, reclassify node:test entries.
 * Run with --apply to mutate; default is a dry run that prints the plan.
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = process.cwd();
const manifestPath = path.join(root, 'tests', 'quarantine-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const NODE_TEST_NOTE = 'valid under `node --test`; excluded from vitest (node:test suites are invisible to vitest); follow-up SD-REFILL-00CO4E8Q: convert to vitest or wire a node:test CI lane';

function fileExists(p) { try { return fs.existsSync(p); } catch { return false; } }

function moduleResolvable(testFile, sig) {
  const mm = sig.match(/Cannot find module '([^']+)'/);
  if (!mm) return null; // not a module-gone signature
  const spec = mm[1];
  const dir = path.dirname(path.join(root, testFile));
  // Resolve the spec AND a version with any trailing source extension stripped, so a test that
  // imports './x.js' still resolves './x.cjs' (a .js->.cjs rename is a FIX, not a dead test).
  const specNoExt = spec.replace(/\.(js|cjs|mjs|ts|tsx)$/, '');
  const roots = [];
  for (const sp of new Set([spec, specNoExt])) {
    if (sp.startsWith('/')) roots.push(path.join(root, sp.replace(/^\//, '')));
    else if (sp.startsWith('.')) roots.push(path.resolve(dir, sp));
    else roots.push(path.join(root, sp));
  }
  const exts = ['', '.js', '.cjs', '.mjs', '.ts', '.tsx', '/index.js', '/index.cjs', '/index.mjs'];
  const candidates = [];
  for (const b of roots) for (const e of exts) candidates.push(b + e);
  return { spec, found: candidates.some(fileExists) };
}

function readSrc(testFile) { try { return fs.readFileSync(path.join(root, testFile), 'utf8'); } catch { return null; } }
function isNodeTest(src) { return src != null && /from\s+['"]node:test['"]|require\(['"]node:test['"]\)/.test(src); }
function hasTestCalls(src) { return src != null && /\b(it|test)\s*\(|\bdescribe\s*\(/.test(src); }

const STALE_EXT_NOTE = 'module exists at a different extension (e.g. .js->.cjs rename); test import path is stale. follow-up SD-REFILL-00CO4E8Q: update the import extension and de-quarantine.';
const EMPTY_SUITE_NOTE = 'file loads but registers no runner-visible tests (empty/conditional suite) — not a load error. follow-up SD-REFILL-00CO4E8Q: restore/skip-annotate the suite or delete if obsolete.';

const sle = manifest.quarantined.filter(x => x.reason_class === 'suite-load-error');
// reclass: [entry, newReasonClass, note]
const toDelete = [], toReclass = [], leave = [];

for (const entry of sle) {
  const f = entry.file;
  const sig = entry.error_signature || '';
  const abs = path.join(root, f);
  if (!fileExists(abs)) { toDelete.push([entry, 'file-already-gone']); continue; }
  if (/(^|\/)(docs\/archived|.*orphan)/i.test(f)) { toDelete.push([entry, 'archived/orphan path']); continue; }
  const src = readSrc(f);
  if (isNodeTest(src) && hasTestCalls(src)) { toReclass.push([entry, 'node-test-runner', NODE_TEST_NOTE]); continue; }
  if (/Cannot find module/.test(sig)) {
    const mr = moduleResolvable(f, sig);
    if (mr && !mr.found) { toDelete.push([entry, 'module-gone:' + mr.spec]); continue; }
    // module resolves at a different extension -> fixable import, NOT dead
    toReclass.push([entry, 'stale-import-extension', STALE_EXT_NOTE]); continue;
  }
  if (!hasTestCalls(src)) { toDelete.push([entry, 'no-test-calls (empty stub)']); continue; }
  // loads + has test calls but no runner-visible suite (e.g. "No test found in suite") -> empty suite
  toReclass.push([entry, 'empty-suite', EMPTY_SUITE_NOTE]);
}

console.log(`suite-load-error=${sle.length}  delete=${toDelete.length}  reclassify=${toReclass.length}  leave=${leave.length}`);
console.log('--- DELETE ---'); for (const [e, r] of toDelete) console.log('  D', e.file, '::', r);
console.log('--- RECLASSIFY ---'); for (const [e, rc] of toReclass) console.log('  R', e.file, '->', rc);
if (leave.length) { console.log('--- LEAVE (flagged) ---'); for (const [e, r] of leave) console.log('  ?', e.file, '::', r); }

if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to delete + rewrite the manifest.'); process.exit(0); }

// APPLY: delete dead files
const deletedFiles = new Set();
for (const [e] of toDelete) {
  const abs = path.join(root, e.file);
  try { if (fileExists(abs)) fs.rmSync(abs); deletedFiles.add(e.file); } catch (err) { console.log('  ! delete failed', e.file, err.message); }
}
// rewrite manifest: drop deleted entries, reclassify per-entry (reason_class + note)
const reclassMap = new Map(toReclass.map(([e, rc, note]) => [e.file, { rc, note }]));
manifest.quarantined = manifest.quarantined
  .filter(x => !deletedFiles.has(x.file))
  .map(x => {
    const rc = reclassMap.get(x.file);
    if (rc) return { ...x, reason_class: rc.rc, reclassified_note: rc.note };
    return x;
  });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const remaining = manifest.quarantined.filter(x => x.reason_class === 'suite-load-error').length;
console.log(`\nAPPLIED: deleted ${deletedFiles.size} files, reclassified ${reclassMap.size}, suite-load-error remaining=${remaining}`);
