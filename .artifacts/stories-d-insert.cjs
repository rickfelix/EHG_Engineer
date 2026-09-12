require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SD_UUID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
const PRD_ID = 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function buildContext(d) {
  return [
    '## Implementation Context',
    '',
    d.ctx_intro,
    '',
    '**Files in play**',
    d.ctx_files,
    '',
    d.ctx_extra,
    '',
    '**Testing**',
    'Tests are *.test.js (NOT .test.mjs - vitest.config.js:288-303 collects **/*.test.js only). Every dependency is injected (sb, auth, calendar, drive, gmail, todoist, now); no test touches a live API or a live table. The michael_* tables are unapplied on the live database, so nothing in this child is exercised live - the first real run is the chairman post-migration host smoke.',
    '',
    '**Schema**',
    'No DDL. Every column is already declared in database/migrations/20260906_michael_tables.sql (child B owns it, unapplied). This child ships no migration and applies none.'
  ].join('\n');
}

(async () => {
  const defs = JSON.parse(fs.readFileSync(path.join(__dirname, 'stories-d-defs.json'), 'utf8'));

  // Guard 1: exactly 10, FR-1..FR-10, US-001..US-010, strictly aligned by index.
  const expectedFr = Array.from({ length: 10 }, (_, i) => `FR-${i + 1}`);
  const expectedUs = Array.from({ length: 10 }, (_, i) => `US-${String(i + 1).padStart(3, '0')}`);
  if (defs.length !== 10) throw new Error(`expected 10 story defs, got ${defs.length}`);
  defs.forEach((d, i) => {
    if (d.fr !== expectedFr[i]) throw new Error(`index ${i}: fr ${d.fr} != ${expectedFr[i]}`);
    if (d.us !== expectedUs[i]) throw new Error(`index ${i}: us ${d.us} != ${expectedUs[i]}`);
  });

  // Guard 2: every def's criterion must match the PRD FR of the same id (by id lookup, NOT position).
  const { data: prd, error: prdErr } = await sb
    .from('product_requirements_v2').select('functional_requirements').eq('id', PRD_ID).single();
  if (prdErr) throw prdErr;
  const frById = new Map(prd.functional_requirements.map(f => [f.id, f]));
  defs.forEach(d => {
    const fr = frById.get(d.fr);
    if (!fr) throw new Error(`${d.fr} not present in PRD`);
    if (fr.requirement !== d.criterion) {
      throw new Error(`${d.fr} criterion drift:\n  def: ${d.criterion}\n  prd: ${fr.requirement}`);
    }
    const wantPriority = fr.priority.toLowerCase();
    if (wantPriority !== d.priority) throw new Error(`${d.fr} priority drift: def ${d.priority} vs prd ${wantPriority}`);
  });
  console.log('PRE-INSERT GUARDS PASSED: 10 defs, FR-1..FR-10 aligned by id, criteria and priorities match the PRD.');

  const rows = defs.map(d => ({
    story_key: `${SD_KEY}:${d.us}`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: d.title,
    user_role: d.user_role,
    user_want: d.user_want,
    user_benefit: d.user_benefit,
    story_points: d.points,
    priority: d.priority,
    status: 'ready',
    acceptance_criteria: d.ac,
    technical_notes: JSON.stringify({
      generated_by: 'LLM',
      source_requirement_id: d.fr,
      original_criterion: d.criterion,
      gaps_detected: []
    }),
    implementation_context: buildContext(d),
    created_by: 'PLAN_LLM'
  }));

  const { data: inserted, error } = await sb.from('user_stories').insert(rows).select('id,story_key,technical_notes');
  if (error) throw error;
  console.log(`INSERTED ${inserted.length} rows`);

  // Guard 3 (the -C defect check): re-read from the DB and verify every persisted story maps to its FR.
  const { data: check, error: chkErr } = await sb
    .from('user_stories')
    .select('story_key,title,priority,story_points,status,technical_notes,acceptance_criteria,implementation_context,user_role,user_want,user_benefit,sd_id,created_by')
    .eq('prd_id', PRD_ID).order('story_key');
  if (chkErr) throw chkErr;

  const problems = [];
  if (check.length !== 10) problems.push(`row count ${check.length} != 10`);
  check.forEach((r, i) => {
    const wantKey = `${SD_KEY}:${expectedUs[i]}`;
    if (r.story_key !== wantKey) problems.push(`${r.story_key}: key order drift, expected ${wantKey}`);
    const tn = JSON.parse(r.technical_notes);
    const wantFr = expectedFr[i];
    if (tn.source_requirement_id !== wantFr) problems.push(`${r.story_key}: source_requirement_id ${tn.source_requirement_id} != ${wantFr}`);
    const fr = frById.get(tn.source_requirement_id);
    if (!fr) { problems.push(`${r.story_key}: FR ${tn.source_requirement_id} missing from PRD`); return; }
    if (fr.requirement !== tn.original_criterion) problems.push(`${r.story_key}: original_criterion does not match PRD ${fr.id}`);
    if (fr.priority.toLowerCase() !== r.priority) problems.push(`${r.story_key}: priority ${r.priority} != PRD ${fr.priority}`);
    if (r.sd_id !== SD_UUID) problems.push(`${r.story_key}: sd_id drift`);
    if (r.created_by !== 'PLAN_LLM') problems.push(`${r.story_key}: created_by drift`);
    if (r.status !== 'ready') problems.push(`${r.story_key}: status ${r.status} != ready`);
    if (!r.implementation_context || r.implementation_context.length < 400) problems.push(`${r.story_key}: implementation_context too thin`);
    if (!Array.isArray(r.acceptance_criteria) || r.acceptance_criteria.length < 1 || r.acceptance_criteria.length > 5) {
      problems.push(`${r.story_key}: acceptance_criteria count ${r.acceptance_criteria && r.acceptance_criteria.length}`);
    }
    (r.acceptance_criteria || []).forEach((ac, j) => {
      ['scenario', 'given', 'when', 'then'].forEach(k => {
        if (!ac[k] || typeof ac[k] !== 'string') problems.push(`${r.story_key} AC${j + 1}: missing ${k}`);
      });
    });
    ['user_role', 'user_want', 'user_benefit'].forEach(k => { if (!r[k]) problems.push(`${r.story_key}: missing ${k}`); });
    if (!r.story_points) problems.push(`${r.story_key}: missing story_points`);
  });

  // Guard 4: refusal / inert vocabulary coverage across the story set.
  const vocab = ['outside_et_window', 'tables_absent', 'in_flight', 'already_ok', 'upstream_not_ready',
    'HOST_VENUE_REQUIRED', 'APPLY_NOT_LANDED', 'PROVENANCE_MISSING', 'HASH_MISMATCH'];
  const corpus = check.map(r => r.implementation_context).join('\n');
  vocab.forEach(v => { if (!corpus.includes(v)) problems.push(`vocabulary term absent from all contexts: ${v}`); });

  // Guard 5: feeder ids + windows named somewhere in the contexts.
  [['calendar-read', '04:00-05:00'], ['gmail-triage', '04:30-05:30'], ['tasks-classifier', '03:45-04:30'],
   ['todoist-brief', '04:45-05:30'], ['seat-classify', null]].forEach(([f, w]) => {
    if (!corpus.includes(f)) problems.push(`feeder id absent: ${f}`);
    if (w && !corpus.includes(w)) problems.push(`window absent: ${w}`);
  });

  if (problems.length) {
    console.log('POST-INSERT VERIFICATION FAILED:');
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
  }
  console.log('POST-INSERT VERIFICATION PASSED: all 10 stories map to their FR by id; vocabulary, feeder ids and windows present.');
  check.forEach(r => console.log(`  ${r.story_key} <- ${JSON.parse(r.technical_notes).source_requirement_id} [${r.priority}/${r.story_points}pt/${r.acceptance_criteria.length}AC] ${r.title.slice(0, 70)}`));
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
