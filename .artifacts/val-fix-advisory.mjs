import fs from 'fs';
const P = '.artifacts/val-evidence-v2.json';
const o = JSON.parse(fs.readFileSync(P, 'utf8'));

const detail = [
  'My first pass reported this file as nonexistent — that was WRONG (I had measured the working tree only, with find).',
  'Git history shows database/migrations/20260728_revoke_public_execute_role_flag_rpcs.sql WAS authored, in commit 13d02e18d81',
  '("fix(security): revoke PUBLIC/anon/authenticated EXECUTE on role-flag RPCs"), together with a _DOWN.sql companion.',
  'HOWEVER: "git branch -a --contains 13d02e18d81" returns ONLY the branch fix/role-flag-execute-revoke — NOT main, NOT origin/main —',
  'and "git cat-file -e HEAD:<path>" confirms the file is ABSENT FROM HEAD. The SD\'s premise sentence',
  '("Sequel to the role-flag revoke applied 2026-07-28 ... That closed 4 of 46") therefore rests on a migration that was NEVER MERGED TO MAIN.',
  'It may still have been applied live via the chairman --prod-deploy path (which applies SQL out-of-band and does not require a merge),',
  'but that CANNOT be confirmed in this environment: the four subject functions (set_coordinator_flag, clear_coordinator_flag,',
  'set_solomon_flag, clear_solomon_flag) all MUTATE live seat state, so probing them through PostgREST would risk deposing the live',
  'coordinator or Solomon seat — the exact incident class the SD itself cites as its motivation. The read-only alternative',
  '(PostgREST anon OpenAPI enumeration at /rest/v1/) returns HTTP 401 for the anon key, so it cannot substitute.',
  'VERDICT: the "4 of 46 closed" baseline is UNVERIFIED here and must be confirmed via the repaired pooler or chairman attestation',
  'before the "remaining 42" arithmetic is trusted.'
].join(' ');

const corrected = {
  severity: 'HIGH',
  title: 'CORRECTED + ESCALATED: the SD\'s foundational predecessor migration was never merged to main',
  detail
};

o.metadata.advisory_findings[1] = corrected;
o.findings = o.findings.map(f =>
  f.type === 'CORRECTION' || (f.title && f.title.startsWith('Cited predecessor migration'))
    ? { severity: 'HIGH', type: 'CORRECTION', title: corrected.title, detail }
    : f
);
o.warnings[0] = detail;

const c4 = o.metadata.blocking_conditions.find(c => c.id === 'COND-4');
if (c4) {
  c4.evidence = 'Migration exists only on branch fix/role-flag-execute-revoke; absent from HEAD and from main. '
    + 'public.schema_migrations is empty, so apply-state is unrecorded anywhere machine-readable.';
}
const c1 = o.metadata.blocking_conditions.find(c => c.id === 'COND-1');
if (c1 && !c1.evidence.includes('REINFORCED')) {
  c1.evidence += ' REINFORCED: the SD\'s own cited predecessor (13d02e18d81) writes "FROM PUBLIC, anon, authenticated" on every '
    + 'REVOKE statement, and 20260603_03 does the same. Revoking PUBLIC alongside the named roles is the established pattern in BOTH '
    + 'prior grant migrations in this repo; Bucket B\'s "revoke anon ONLY" deviates from it.';
}

fs.writeFileSync(P, JSON.stringify(o, null, 2));
console.log('repaired. advisory intact:', detail.includes('branch -a --contains'));
console.log('conditions:', o.metadata.blocking_conditions.map(c => c.id).join(','));
