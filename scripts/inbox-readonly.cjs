require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * READ-ONLY WORKER INBOX. Plain SELECT, acks NOTHING, safe to re-run.
 *
 * ROUTING NOTE: this is FLEET TOOLING, not a deliverable of SD-EHG-IDEATION-PIPELINE-SEAMS-001.
 * It is carried in that SD's PR at the coordinator's request (0ab6a99c, 2026-08-05) because an
 * uncommitted file dropped into scripts/ is itself a hazard — untracked files in this shared tree
 * get swept into the test glob (measured: four untracked `.test.*` files under `.claude-work/`
 * are collected despite `git ls-files` being empty for them). Committing it here was the smallest
 * available scope addition.
 *
 * WHY IT EXISTS: `scripts/worker-checkin.cjs` is THE DRAIN — it acks what it returns. Any reader
 * built on top of it CONSUMES what it displays, so re-reading a message to see it untruncated
 * DESTROYS it (measured: ~2249 chars of a coordinator reply, unrecoverable).
 * ⇒ THE DISPLAY PATH MUST NOT BE THE ACK PATH. Use `/checkin` when you intend to ACK; use this to
 * READ.
 *
 * ⚠ THIS FILE HAS BEEN BLIND THREE TIMES. Each version was written by someone who had just been
 * bitten by the previous blindness, and each was blind in a NEW direction. That is the point of
 * the comment being this long — THE FIX FOR A BLIND READER IS USUALLY BLIND TOO.
 *   v0  `worker-checkin | grep subject | tail -4` — showed the last FOUR subjects of a 14-message
 *       list and never opened a body, while the drain acked all 14. A chairman ruling sat unread
 *       across three messages for 2.5 hours.
 *   v1  Fetched the newest 60 rows FLEET-WIDE and filtered to one session in JS, so the row budget
 *       belonged to EVERYONE'S traffic. Messages slide out of the window as other seats write.
 *       MEASURED: consecutive runs 20 minutes apart reported 7, then 5. Scoped server-side, the
 *       same query reported 29 — it had been showing 17% of one inbox and reporting it as all.
 *   v2  Filtered server-side on `target_session = <uuid>` ALONE. The coordinator measured that
 *       across all 5,395 rows this MISSES 451 — see the addressing paths below. Same seat, same
 *       moment: uuid-only 29, all four clauses 132.
 *
 * ADDRESSING PATHS, measured over the full table — a uuid-equality filter covers only the first:
 *   1. `target_session` = the seat's full uuid.
 *   2. BROADCAST SENTINELS, live and heavily used: `broadcast` (102 rows),
 *      `broadcast-coordinator` (333), `broadcast-adam` (6). The `/coordinator start` flow drains
 *      and re-targets `broadcast-coordinator`, so these are delivery, not debris.
 *   3. ⚠ TRUNCATED ADDRESSES — A DEFECT, NOT A DESIGN. Something writes EIGHT-CHARACTER session
 *      PREFIXES into `target_session` instead of full uuids (af78b5da 7 rows, b25ec3e5 2,
 *      d6f66610 1). Those rows can never match an equality filter on a full uuid: they are
 *      ADDRESSED TO NOBODY and no error was ever raised — an address well-formed to the writer
 *      that matches nothing at the reader. The 8-char clause below exists so a seat can at least
 *      SEE mail sent to its truncated address. IT IS COVERAGE FOR A BUG, NOT AN ENDORSEMENT OF
 *      THE FORMAT — DO NOT "CLEAN IT UP" UNTIL THE WRITER IS FIXED, or you silently re-blind
 *      every reader on the fleet.
 *
 * ⚠ `target_sd` IS A GENUINE SECOND ADDRESSING COLUMN AND IS DELIBERATELY NOT INCLUDED HERE.
 * Whether a worker should receive SD-addressed mail is a DESIGN question, not a coding one, and it
 * is unsettled. FLAGGED RATHER THAN SILENTLY DECIDED IN EITHER DIRECTION — if you need it, decide
 * it explicitly; do not quietly add the clause.
 */

const SID = process.env.CLAUDE_SESSION_ID;
// FAIL LOUDLY, NEVER DEFAULT. An earlier draft fell back to its author's own session id, which
// would have made any seat with an unset env silently read SOMEONE ELSE'S inbox and conclude its
// own was empty. A wrong answer delivered confidently is worse than no answer.
if (!SID) {
  console.error('FATAL: CLAUDE_SESSION_ID is not set. Refusing to guess a session — a default here');
  console.error('       would read another seat\'s inbox and report it as yours. Set it and re-run.');
  process.exit(1);
}
const SHORT = SID.slice(0, 8);

// Optional role broadcasts. If unset, role-addressed mail is NOT shown — and the tool SAYS SO on
// every run rather than omitting it silently, because an invisible omission is the defect class
// this whole file exists to fight. Not guessing a role is deliberate: a worker slurping
// `broadcast-coordinator` would be wrong in the other direction.
const ROLE = process.env.FLEET_ROLE || null;

const CLAUSES = [
  `target_session.eq.${SID}`,
  'target_session.eq.broadcast',
  `target_session.eq.${SHORT}`,            // Path 3 coverage — see the defect note above.
];
if (ROLE) CLAUSES.push(`target_session.eq.broadcast-${ROLE}`);
const OR_FILTER = CLAUSES.join(',');

const PAGE = 200;

(async () => {
  const n = Number(process.argv[2] || 3);

  // THE COUNTER — and it MUST use the SAME `.or()` as the fetch. A COUNTER MEASURING A DIFFERENT
  // POPULATION THAN THE ROWS IT IS COMPARED AGAINST IS NOT A TWO-SIDED CONTROL, IT IS A SECOND WAY
  // TO BE WRONG: it reports agreement between two numbers that describe different things.
  const { count: total, error: cErr } = await supabase
    .from('session_coordination')
    .select('*', { count: 'exact', head: true })
    .or(OR_FILTER);
  if (cErr) { console.error('COUNT FAILED:', cErr.message); process.exit(1); }
  // head:true on a MISSING table returns a NULL count and NO error — never narrate null as 0.
  if (total === null || total === undefined) {
    console.error('COUNT returned NULL — table or column may not exist. NOT the same as zero.');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('session_coordination')
    .select('*')
    .or(OR_FILTER)
    // nullsFirst:false is NOT optional: Postgres orders NULLs FIRST on DESC, so a plain recency
    // sort puts never-stamped rows in the freshest position.
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(PAGE);
  if (error) { console.error('READ FAILED:', error.message); process.exit(1); }

  const rows = data || [];
  console.log('session: ' + SID + '   role-broadcasts: ' + (ROLE ? 'broadcast-' + ROLE : 'NOT INCLUDED (FLEET_ROLE unset)'));
  console.log('addressed to me: ' + total + '   fetched: ' + rows.length + '   showing: ' + Math.min(n, rows.length));
  if (rows.length < total) {
    console.log('⚠ TRUNCATED: ' + (total - rows.length) + ' older message(s) not fetched (PAGE=' + PAGE + '). Raise PAGE or paginate.');
  }
  if (total > 0 && rows.length === 0) {
    console.log('⚠ COUNT>0 BUT ZERO ROWS — filter and counter disagree; do NOT read this as an empty inbox.');
  }
  console.log('');

  rows.slice(0, n).forEach((r) => {
    const p = r.payload || {};
    console.log('=== ' + r.created_at + '  type=' + (r.message_type || '?') +
      '  to=' + (r.target_session === SID ? 'me' : r.target_session) +
      '  acked=' + (r.acknowledged_at ? 'yes' : 'NO') + ' ===');
    console.log('SUBJECT: ' + (r.subject || p.subject || '(none)'));
    console.log(String(r.body || p.body || '(no body)'));  // FULL body — never truncated here.
    console.log('');
  });
})();
