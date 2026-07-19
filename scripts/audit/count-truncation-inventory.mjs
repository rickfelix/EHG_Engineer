#!/usr/bin/env node
/**
 * count-truncation-inventory.mjs — FR-1 enumerated inventory
 * (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001).
 *
 * Enumerates supabase `.select(` call sites across scripts/ and lib/ and
 * classifies each for the count/truncation-discipline sweep:
 *   already-exact       — uses { count: 'exact' } (usually with head: true)
 *   bounded-by-design   — .single()/.maybeSingle()/.limit(N<cap) on the same chain
 *   paginated           — .range( on the same chain, or routed through fetchAllPaginated
 *   needs-review        — none of the above: candidate gauge/bulk site (FR-6/FR-7 ledger)
 * Classifications are heuristic; scripts/audit/count-truncation-overrides.json
 * (site key "path:line") force-classifies any site and records exemption notes.
 *
 * Deterministic + re-runnable: output sorted by path/line, written to
 * docs/audits/count-truncation-inventory.json. Exit 0 always (audit, not gate).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['scripts', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '__tests__', 'tests', 'fixtures']);
const EXTS = new Set(['.js', '.mjs', '.cjs']);
const OVERRIDES_PATH = path.join(ROOT, 'scripts', 'audit', 'count-truncation-overrides.json');
const OUT_PATH = path.join(ROOT, 'docs', 'audits', 'count-truncation-inventory.json');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (EXTS.has(path.extname(entry.name)) && !/\.test\.[cm]?js$/.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

/** The statement window: the .select( line plus the rest of its chain (heuristic: until a line ending in ';' or blank). */
function chainWindow(lines, idx) {
  // 3 lines of BACKWARD context: a paginated site wraps the builder in a callback
  // (fetchAllPaginated(() => sb.from(...)) with .select( on a later line), so the
  // pagination marker sits above the .select line.
  let win = lines.slice(Math.max(0, idx - 3), idx).join('\n') + '\n' + lines[idx];
  for (let j = idx + 1; j < Math.min(idx + 12, lines.length); j++) {
    // Comment lines interleaved in a builder chain (common: per-filter rationale comments)
    // do not terminate the statement — skip them so a .limit() below a comment is still seen.
    if (/^\s*\/\//.test(lines[j])) continue;
    if (!/^\s*\./.test(lines[j]) && !/[,({[]$/.test(lines[j - 1]?.trim() ?? '')) break;
    win += '\n' + lines[j];
  }
  return win;
}

export function classifyChain(win) {
  if (/count:\s*['"]exact['"]/.test(win)) return 'already-exact';
  if (/\.single\(\)|\.maybeSingle\(\)/.test(win)) return 'bounded-by-design';
  if (/\.limit\(\s*(\d+)\s*\)/.test(win) && Number(RegExp.$1) < 1000) return 'bounded-by-design';
  if (/\.range\(|fetchAllPaginated|fapPaginate/.test(win)) return 'paginated'; // fapPaginate: CJS call sites' local ESM-bridge wrapper
  if (/assertNotCapTruncated|warnIfCapTruncated/.test(win)) return 'tripwired';
  return 'needs-review';
}

function loadOverrides() {
  try { return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8')); } catch { return {}; }
}

export function buildInventory({ root = ROOT } = {}) {
  const overrides = loadOverrides();
  const sites = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\.select\s*\(/.test(line) || /\/\/|\/\*|^\s*\*/.test(line.slice(0, line.indexOf('.select')))) return;
        const key = `${rel}:${i + 1}`;
        const auto = classifyChain(chainWindow(lines, i));
        // An override without a note is ignored (falls back to auto): a note-less override
        // could silently drop a needs-review site from the checked-in ledger with no trace.
        const raw = overrides[key];
        const ov = raw && raw.note ? raw : undefined;
        sites.push({
          site: key,
          classification: ov?.classification || auto,
          auto_classification: auto,
          ...(ov?.note ? { exemption_note: ov.note } : {}),
          snippet: line.trim().slice(0, 160),
        });
      });
    }
  }
  sites.sort((a, b) => a.site.localeCompare(b.site));
  const byClass = {};
  for (const s of sites) byClass[s.classification] = (byClass[s.classification] || 0) + 1;
  // The checked-in artifact carries FULL entries only for the actionable needs-review
  // ledger (FR-6/FR-7 scope) plus any override-exempted site (auditability of the
  // exemption). Auto-classified bounded/exact/paginated sites appear as counts only —
  // re-running this script re-derives them deterministically.
  const ledger = sites.filter((s) => s.classification === 'needs-review' || s.exemption_note);
  return {
    sd: 'SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001',
    generated_by: 'scripts/audit/count-truncation-inventory.mjs',
    total_sites: sites.length,
    by_classification: byClass,
    ledger_sites: ledger.map(({ snippet, ...rest }) => rest),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const inv = buildInventory();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(inv, null, 1) + '\n');
  console.log(`count-truncation inventory: ${inv.total_sites} sites → ${path.relative(ROOT, OUT_PATH)}`);
  console.log(JSON.stringify(inv.by_classification, null, 1));
}
