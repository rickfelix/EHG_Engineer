import { _internal } from '../lib/eva/devils-advocate.js';
const { computeContentHash, buildCritiqueUserPrompt } = _internal;

// Hash exactly the way critiquePlanProposal does it now (devils-advocate.js:536-539).
const H = (P, arch = '') => {
  const b = buildCritiqueUserPrompt({ prdContent: P, archContent: arch, sdContext: { sd_key: 'SD-X', title: 'T' } });
  return {
    h: computeContentHash({
      prdRawText: b.prdRawText, archRawText: b.archRawText, archLoadStatus: 'ok', model: 'gpt-5.4',
      
    }),
    prdText: b.prdText, archText: b.archText, t: b.truncated,
  };
};
const mkFR = (n, pad) => Array.from({ length: n }, (_, i) => ({ id: `FR-${i + 1}`, title: `t${i + 1}`, description: 'x'.repeat(pad) }));
const R = (label, a, b) => {
  const prefixSame = a.prdText === b.prdText && a.archText === b.archText;
  console.log(`${label}\n   sent-prefix identical: ${prefixSame} | hash collides: ${a.h === b.h} => ${a.h === b.h ? 'STILL EXPLOITABLE' : 'CLOSED'}`);
};

console.log('########## PART 1: my three ORIGINAL exploits (all length-CHANGING appends) ##########\n');

// ORIGINAL CASE 1: over-budget risks section appended past its 8000-char budget
const c1a = { executive_summary: 'ES', functional_requirements: mkFR(60, 1500), acceptance_criteria: 'AC', test_scenarios: 'TS', risks: 'R'.repeat(9000) };
const c1b = { ...c1a, risks: 'R'.repeat(9000) + ' NEW UNREVIEWED RISK: we will ship without rollback.' };
R('CASE 1 (append to over-budget risks):', H(c1a), H(c1b));

// ORIGINAL CASE 2: existing FR description extended past the cut, FR id set unchanged
const frs = mkFR(60, 1500);
const c2a = { executive_summary: 'ES', functional_requirements: frs, acceptance_criteria: 'AC', test_scenarios: 'TS', risks: 'RK' };
const frs2 = JSON.parse(JSON.stringify(frs)); frs2[59].description += 'Z'.repeat(4000);
R('CASE 2 (grow existing FR body past cut):', H(c2a), H({ ...c2a, functional_requirements: frs2 }));

// ORIGINAL CASE 3: arch content appended past the 64,000 cap
const p = { executive_summary: 'ES', functional_requirements: [{ id: 'FR-1', description: 'd' }], acceptance_criteria: 'AC', test_scenarios: 'TS', risks: 'RK' };
R('CASE 3 (append to over-cap arch):', H(p, 'A'.repeat(70000)), H(p, 'A'.repeat(70000) + ' NEW UNREVIEWED ARCH SECTION'));

console.log('\n########## PART 2: length-PRESERVING edits past the boundary (the documented residual) ##########\n');

// RESIDUAL A: arch — realistic length-preserving edit past char 64,000 (a date/threshold/enum change)
const archBase = 'A'.repeat(64000) + ' rollback plan: restore snapshot 2026-08-16 before cutover; RLS enabled=true ' + 'B'.repeat(60000);
const archEdit = 'A'.repeat(64000) + ' rollback plan: restore snapshot 2026-09-16 before cutover; RLS enabled=fals ' + 'B'.repeat(60000);
console.log(`   (arch lengths equal: ${archBase.length === archEdit.length}, content differs past cut: ${archBase !== archEdit})`);
R('RESIDUAL A (arch, length-preserving edit past cut):', H(p, archBase), H(p, archEdit));

// RESIDUAL B: PRD — length-preserving edit inside an over-budget section, past its budget
const rk1 = 'R'.repeat(8000) + ' mitigation owner: alice ; data-loss risk accepted=false';
const rk2 = 'R'.repeat(8000) + ' mitigation owner: carol ; data-loss risk accepted=true ';
console.log(`   (risks lengths equal: ${rk1.length === rk2.length})`);
const b1 = { executive_summary: 'ES', functional_requirements: mkFR(60, 1500), acceptance_criteria: 'AC', test_scenarios: 'TS', risks: rk1 };
R('RESIDUAL B (PRD over-budget section, length-preserving):', H(b1), H({ ...b1, risks: rk2 }));

// RESIDUAL C: PRD — swap an entire invisible FR body for different same-length content
const frsA = mkFR(60, 1500); const frsB = JSON.parse(JSON.stringify(frsA));
frsB[59].description = 'q'.repeat(1500); // same length, entirely different content, past the cut
R('RESIDUAL C (invisible FR body swapped, same length):', H({ ...c2a, functional_requirements: frsA }), H({ ...c2a, functional_requirements: frsB }));

console.log('\n########## PART 3: is the "full-content hashing is too expensive" premise true? ##########\n');
console.log('   charsTotal itself is derived from FULLY-materialized content:');
console.log('   - buildBudgetedPrdText serializes all 5 sections (esRaw/acRaw/tsRaw/rkRaw/frRawForTotal) BEFORE the fast-path check');
console.log('   - archRaw = String(archContent) is the full arch string');
console.log('   => the full content is already in memory and already fully serialized to compute charsTotal.');
const bigArch = 'A'.repeat(150000);
const bigPrd = { executive_summary: 'e'.repeat(3000), functional_requirements: mkFR(200, 500), acceptance_criteria: 'a'.repeat(4000), test_scenarios: 't'.repeat(9000), risks: 'r'.repeat(9000) };
const crypto = await import('node:crypto');
const t0 = process.hrtime.bigint();
for (let i = 0; i < 100; i++) crypto.createHash('sha256').update(JSON.stringify(bigPrd)).update(bigArch).digest('hex');
const t1 = process.hrtime.bigint();
console.log(`   sha256 over FULL content (${(JSON.stringify(bigPrd).length + bigArch.length / 1)} chars): ${(Number(t1 - t0) / 1e6 / 100).toFixed(3)} ms/call`);
