#!/usr/bin/env node
// Full-document sweep of every PRD field for residual stale guard / predicate text.
import fs from 'fs';

const prd = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))[0];

// Walk every field, flatten to (path, string) pairs.
const pairs = [];
function walk(node, path) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    // some fields are JSON-encoded strings; try to descend
    const t = node.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { walk(JSON.parse(t), path + '(parsed)'); return; } catch { /* fall through */ }
    }
    pairs.push([path, node]);
    return;
  }
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, path + '[' + i + ']')); return; }
  if (typeof node === 'object') { for (const k of Object.keys(node)) walk(node[k], path + '.' + k); return; }
}
for (const k of Object.keys(prd)) walk(prd[k], k);

const probes = [
  ['WHOLE-BLOB guard prescribed', /IF\s+(TG_OP\s*=\s*'INSERT'\s*OR\s*)?OLD\.metadata IS DISTINCT FROM NEW\.metadata/],
  ['SUB-KEY guard prescribed', /OLD\.metadata->'control_pack_status' IS DISTINCT FROM NEW\.metadata->'control_pack_status'/],
  ['presence requirement stated', /(all 4|ALL 4).{0,40}(PRESENT|present)/],
  ['inequality-only (no presence)', /(true iff|only when) (no|none|NONE)[^.]{0,60}not_attempted/],
  ['claims bare guard ERRORS on insert', /(raises|raise|errors?|error).{0,60}not assigned yet/],
  ['claims mirrors allRequiredEvaluated EXACTLY', /allRequiredEvaluated exactly|mirror[a-z]* .{0,30}exactly/],
  ['omitted-column-skips claim', /column omitted, relying on its default/],
  ['fabricated citation (result-recorder:122)', /result-recorder\.js:122/],
  ['deliberate divergence stated', /DELIBERATELY MORE STRICT|deliberately diverges|deliberate divergence/]
];

for (const [label, re] of probes) {
  const hits = pairs.filter(([, s]) => re.test(s));
  console.log('\n### ' + label + '  -> ' + hits.length + ' field(s)');
  for (const [p, s] of hits) {
    const m = s.match(re);
    const i = s.indexOf(m[0]);
    console.log('   ' + p);
    console.log('      ...' + s.slice(Math.max(0, i - 110), i + m[0].length + 110).replace(/\s+/g, ' ') + '...');
  }
}

// Cross-check: every TS id cited anywhere actually exists
const tsIds = new Set((prd.test_scenarios || []).map((t) => t.id));
console.log('\n### TS ids defined: ' + [...tsIds].sort().join(', '));
const cited = new Set();
for (const [, s] of pairs) for (const m of s.matchAll(/\bTS-[0-9]+[a-z]?\b/g)) cited.add(m[0]);
const missing = [...cited].filter((c) => !tsIds.has(c));
console.log('### TS ids cited anywhere: ' + [...cited].sort().join(', '));
console.log('### CITED BUT NOT DEFINED: ' + (missing.length ? missing.join(', ') : 'none'));

// Cross-check: AC count vs FR-3 ACs vs TS coverage
const fr3 = (prd.functional_requirements || []).find((f) => f.id === 'FR-3');
console.log('\n### FR-3 acceptance_criteria count: ' + (fr3.acceptance_criteria || []).length);
const frIds = (prd.functional_requirements || []).map((f) => f.id);
console.log('### FR ids: ' + frIds.join(', '));
