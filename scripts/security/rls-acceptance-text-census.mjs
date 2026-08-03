#!/usr/bin/env node
/**
 * DB-RESIDENT ACCEPTANCE-TEXT CENSUS — SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001 (SURVEY-4 + SURVEY-6).
 *
 * WHY THIS EXISTS. A file grep cannot see any of this. Acceptance criteria, test scenarios and
 * sub-agent verdicts live in Postgres columns and JSONB, so a repo-wide sweep for "42501" reports a
 * clean bill of health while the instruction to infer enforcement from an error code sits in the
 * acceptance text that workers actually build against. Prose in a DB row is as load-bearing as code.
 *
 * IT REPORTS A DENOMINATOR. It scans EVERY row of each surveyed table rather than confirming the
 * 16 SDs + 22 PRDs measured at LEAD, so an item nobody suspected is still found — and so the LEAD
 * figure is CHECKED rather than assumed. A count is not a list.
 *
 * SURVEY-6 PROVENANCE, per item, because "mentions readback" and "prescribes the sufficient remedy"
 * are different claims and 4 of 7 SURVEY-1 items were mis-bucketed on exactly that difference:
 *   ABSENT                 - infers enforcement from an error/rejection, says nothing about
 *                            confirming the write did not land.
 *   PRESENT-BUT-UNQUOTED   - mentions readback/verification, but does not PRESCRIBE it as the check.
 *   PRESENT-AND-HALF-RIGHT - prescribes a readback and stops at two legs, so it cannot distinguish a
 *                            refusal from a write that lands without RETURNING. The worked instance
 *                            is decision-disposition.mjs:55-63.
 * Using the right vocabulary is not being safe: the HALF-RIGHT bucket is the dangerous one precisely
 * because it reads as rigorous.
 *
 * SIBLING-REPO BOUNDARY — SURVEYED, FIX DEFERRED, STATED HERE SO IT IS NOT SILENTLY OMITTED.
 * EHG_Engineer and ehg share ONE database, so ehg's RLS assertions are claims about the same
 * policies this census covers. ehg/tests/e2e/chairman-settings-rls.spec.ts, surveyed 2026-08-03:
 *   :256, :299, :325   expect(error.code).toBe('42501')        - leg 1 only
 *   :402, :417         expect(['PGRST116','42501']).toContain(error.code)
 *   :257, :326         expect(error.message).toContain('row-level security policy')
 * VERDICT: ABSENT. No assertion reads the row back after a denial. The file DOES build a
 * serviceClient, but it is used for FIXTURE SETUP (creating companies and settings), never as leg 2 —
 * so the capability is present and unused, which is why a reader scanning for "service role" would
 * wrongly score this file as rigorous.
 * :257 and :326 additionally match on error.MESSAGE TEXT, which is unsound here: a genuinely-denied
 * control returns the same SQLSTATE AND the same message string, so those two assertions cannot
 * distinguish the case they exist to distinguish.
 * NOTE the anchor SD said "8 assertions"; the measured figure is 5 on the code plus 2 on the message.
 * A count is not a list — this is the list.
 * FIX IS OUT OF SCOPE for this SD, with a reason rather than by omission: it is a different repo with
 * its own CI, review and release path, and rewriting another repo's e2e assertions from inside this
 * one would ship an unreviewed cross-repo change. Filed durably for separate scheduling.
 *
 * USAGE: node scripts/security/rls-acceptance-text-census.mjs [--json] [--show <ID>]
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });  // banner on stdout would corrupt --json

const POOLER_HOST = process.env.SUPABASE_POOLER_HOST || 'aws-1-us-east-1.pooler.supabase.com';

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
  if (!pw || !ref) return null;
  return `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${POOLER_HOST}:5432/postgres`;
}

// A row is IN SCOPE when its text claims a PERMISSION is enforced BECAUSE something was rejected.
//
// TWO CONJUNCTS, and the first one is what makes this a measurement rather than a word-count. A
// first pass used the generic vocabulary of rejection (denied|rejected|403|unauthorized|should fail)
// and returned 3191 rows out of 38164 — against a LEAD measurement of 16 SDs + 22 PRDs. It was not
// finding permission claims; it was finding the word "rejected". The POPULATION a filter measures is
// not the population its name implies.
//
// So a hit must carry a token that can ONLY mean a database permission verdict...
const PERMISSION_TOKEN = /(42501|permission denied|row[- ]level security|\bRLS\b|insufficient[_ ]privileg|\bwith check\b|rls polic|security polic|anon(?:ymous)? (?:client|role|key)|service[- ]role (?:client|key|bypass))/i;
// ...AND sit in an ACCEPTANCE/VERIFICATION frame, since the same token in a narrative description is
// not a criterion anyone builds against.
const ACCEPTANCE_FRAME = /(acceptance|criteri|verif|assert|expect|\btest\b|should|must|validate|confirm|prove|evidence)/i;
const NEGATIVE_PROBE_SHAPE = /(42501|permission denied|insufficient[_ ]privileg|should (?:fail|be denied|be rejected|not be able)|must (?:fail|be denied|be rejected)|expect[a-z]*\s+(?:an?\s+)?(?:error|denial|rejection|42501)|denied|rejected|blocked|fails? with|returns? (?:an )?error)/i;

// Does it talk about confirming the row's actual fate?
const MENTIONS_READBACK = /(read[- ]?back|readback|service[- ]?role|verify (?:the )?(?:row|write|record)|confirm (?:the )?(?:row|write|absen)|row (?:is )?(?:absent|not present)|select .* after|deletion count|deleted count|no row (?:was )?(?:created|inserted|written))/i;
// Does it PRESCRIBE it — an instruction, not a mention?
const PRESCRIBES_READBACK = /(must (?:read ?back|verify|confirm)|then (?:read ?back|verify|confirm|select)|confirm (?:with|via|using) (?:the )?service|read ?back (?:as|with|using) service|verify .* absent|assert .* (?:absent|not present|no row))/i;
// The third leg — re-attempting the identical write WITHOUT RETURNING. Its absence is what makes an
// otherwise-rigorous-looking criterion HALF-RIGHT.
const THIRD_LEG = /(without returning|no returning|bare insert|omit(?:ting)? \.?select|insert without \.?select|second (?:attempt|write) without|re-?attempt .* without)/i;

function classify(text) {
  // All three conjuncts, in the order that rejects cheapest-first.
  if (!PERMISSION_TOKEN.test(text)) return null;
  if (!ACCEPTANCE_FRAME.test(text)) return null;
  if (!NEGATIVE_PROBE_SHAPE.test(text)) return null;
  if (THIRD_LEG.test(text)) return 'SUFFICIENT';                     // all three legs described
  if (PRESCRIBES_READBACK.test(text)) return 'PRESENT-AND-HALF-RIGHT';
  if (MENTIONS_READBACK.test(text)) return 'PRESENT-BUT-UNQUOTED';
  return 'ABSENT';
}

/** Flatten any column value (text, jsonb, arrays) to one searchable string. */
function flatten(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(flatten).join('\n');
  if (typeof v === 'object') return Object.values(v).map(flatten).join('\n');
  return String(v);
}

const TARGETS = [
  { table: 'strategic_directives_v2', id: 'sd_key',
    cols: ['title', 'description', 'scope', 'acceptance_criteria', 'success_criteria', 'strategic_intent', 'rationale'] },
  { table: 'product_requirements_v2', id: 'id',
    cols: ['title', 'acceptance_criteria', 'test_scenarios', 'functional_requirements', 'technical_requirements', 'validation_checklist'] },
  { table: 'sub_agent_execution_results', id: 'id',
    cols: ['summary', 'results', 'conditions', 'justification', 'metadata'] },
];

async function main() {
  const cs = connectionString();
  if (!cs) { console.error('No DATABASE_URL and cannot derive one'); process.exit(2); }
  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const showId = process.argv.includes('--show') ? process.argv[process.argv.indexOf('--show') + 1] : null;
  const findings = [];
  try {
    for (const t of TARGETS) {
      // Only select columns that actually exist — a hard-coded list drifts and a missing column
      // would abort the whole census.
      const { rows: colRows } = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t.table]);
      const have = new Set(colRows.map((r) => r.column_name));
      const cols = t.cols.filter((c) => have.has(c));
      const missing = t.cols.filter((c) => !have.has(c));
      if (!have.has(t.id)) { console.error(`  ! ${t.table}: id column ${t.id} absent — skipped`); continue; }
      const { rows } = await client.query(`SELECT ${[t.id, ...cols].map((c) => `"${c}"`).join(', ')} FROM ${t.table}`);
      let scanned = 0;
      for (const r of rows) {
        scanned++;
        const text = cols.map((c) => flatten(r[c])).join('\n');
        const verdict = classify(text);
        if (verdict) findings.push({ table: t.table, id: String(r[t.id]), verdict, text });
      }
      console.error(`scanned ${t.table}: ${scanned} row(s), cols=[${cols.join(',')}]${missing.length ? ` (absent: ${missing.join(',')})` : ''}`);
    }

    if (showId) {
      for (const f of findings.filter((x) => x.id === showId)) {
        console.log(`\n=== ${f.table} ${f.id} — ${f.verdict}\n${f.text.slice(0, 4000)}`);
      }
      return;
    }
    if (process.argv.includes('--json')) { console.log(JSON.stringify(findings.map(({ text, ...k }) => k), null, 2)); return; }

    console.log(`\nNEGATIVE-PROBE ACCEPTANCE TEXT — items whose text infers enforcement from a rejection: ${findings.length}`);
    const order = ['ABSENT', 'PRESENT-BUT-UNQUOTED', 'PRESENT-AND-HALF-RIGHT', 'SUFFICIENT'];
    for (const v of order) {
      const g = findings.filter((f) => f.verdict === v);
      console.log(`\n  ${v}: ${g.length}`);
      for (const f of g) console.log(`    ${f.table} | ${f.id}`);
    }
    console.log('\nBY TABLE:');
    for (const t of TARGETS) {
      const g = findings.filter((f) => f.table === t.table);
      if (!g.length) { console.log(`  ${t.table}: 0`); continue; }
      const by = order.map((v) => `${v}=${g.filter((f) => f.verdict === v).length}`).join(' ');
      console.log(`  ${t.table}: ${g.length}  (${by})`);
    }
  } finally { await client.end(); }
}

main().catch((e) => { console.error('census failed:', e.message); process.exit(1); });
