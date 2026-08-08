/**
 * Operator Contract gate — the D8 build-vs-run merge-time invariant.
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001, design:
 *  docs/design/ehg-build-vs-run-deepdive-decisions.md @ aee41d6c §4)
 *
 * PURE MODULE — no DB access, no fs. Every input (changed files, migration SQL,
 * periodic_process_registry rows, retention policy list, SD metadata) is injected
 * so the same logic binds BOTH the harness handoff gate and the venture-factory
 * seam (FR-7) with zero duplicated detection/validation logic. The DB-reading
 * adapters live alongside this module and call these functions.
 *
 * The invariant: an SD that ships a CREATOR (new table / writer / feature flag /
 * detector) may not pass its final gate unless the SAME SD (or a dated,
 * audit-logged waiver) also ships its OPERATOR TRIPLE —
 *   (1) CONSUMER      — code that acts on the created output,
 *   (2) ARMED CADENCE — a periodic_process_registry-stamped, on-by-default cron,
 *   (3) REAPER        — a retention/TTL/retire path (lib/retention/policies.js).
 */

export const CREATOR_KINDS = Object.freeze({
  TABLE: 'table',
  WRITER: 'writer',
  FLAG: 'flag',
  DETECTOR: 'detector',
});

export const TRIPLE_MEMBERS = Object.freeze(['consumer', 'armed_cadence', 'reaper']);

/**
 * FR-1 — CREATOR detection heuristic.
 *
 * Conservative-inclusive: ambiguous cases classify AS a CREATOR so the operator
 * triple is demanded rather than silently skipped (TR-2 fail-toward-safe).
 *
 * @param {Object} input
 * @param {Array<{path: string, added?: string}>} input.changedFiles - changed files with (optional) added-line text
 * @param {Array<{path: string, sql: string}>} [input.migrations] - migration files with SQL body
 * @returns {{is_creator: boolean, creator_kinds: string[], evidence: string[]}}
 */
export function detectCreator({ changedFiles = [], migrations = [] } = {}) {
  const kinds = new Set();
  const evidence = [];

  // First pass: tables this SD CREATEs (its own new persistent state).
  const createdTables = [];
  for (const mig of migrations) {
    const sql = String(mig?.sql || '');
    // CREATE TABLE (not CREATE INDEX/POLICY/VIEW).
    const stmts = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_.]+)/gi);
    if (stmts) {
      kinds.add(CREATOR_KINDS.TABLE);
      evidence.push(`migration ${mig.path}: ${stmts.length} CREATE TABLE statement(s)`);
      for (const s of stmts) {
        const name = s.replace(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?/i, '').trim();
        if (name) createdTables.push(name);
      }
    }
  }

  for (const f of changedFiles) {
    const path = String(f?.path || '');
    // IT SCANS COMMENT PROSE — the identical defect collectSdDiff already fixed for SQL, and the
    // note there applies verbatim: "the file that documents itself most carefully is punished
    // hardest, which is backwards."
    //
    // Demonstrated on this very SD, twice over. The FLAG rule is a WHOLE-TEXT conjunction
    // (mentions leo_feature_flags AND contains an insert call), so the COMMENT I wrote to explain
    // the previous false positive contained both halves and re-triggered it — this file's own
    // explanation of the bug WAS the bug. Its PLAN-TO-LEAD then blocked demanding an armed cadence
    // and a reaper for a flag that exists only inside a sentence.
    //
    // Best-effort strip, matching the SQL precedent: a mention inside a comment is never a
    // creation, and a creator-shaped string in prose is exactly what documentation looks like.
    const added = String(f?.added || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')  // block comments (may be partial in an added-lines slice)
      .replace(/^\s*\*.*$/gm, ' ')        // continuation lines of a JSDoc block the slice cut open
      .replace(/\/\/[^\n]*/g, ' ');       // line comments — where both false positives came from
    if (!/\.(?:js|cjs|mjs|ts)$/.test(path)) continue;
    // A TEST FIXTURE IS NOT A CREATOR. detectWiring and validateConsumer both exclude test
    // paths; detectCreator did not — an asymmetry REGRESSION (a54189e3) flagged and this SD then
    // demonstrated on itself: its own PLAN-TO-LEAD blocked with OPERATOR_CONTRACT_INCOMPLETE
    // because the string "supabase.from('leo_feature_flags').insert(...)" inside a __tests__
    // fixture was read as real flag creation. The gate demanded an armed cadence and a reaper for
    // a flag that does not exist. Fixture text is the most likely place for creator-shaped
    // strings to appear, so the omission fires hardest on well-tested changes.
    if (/(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests\/)/.test(path)) continue;

    // WRITER — a CREATOR signal ONLY when the writer targets a table this SD also
    // CREATEs. Writing to an EXISTING table (audit_log, feedback, ...) is ordinary
    // work, not a build-vs-run CREATOR — flagging it would false-positive nearly
    // every SD (SC#5: zero false-positives across the last 10 non-CREATOR SDs).
    if (createdTables.length && /\.(?:insert|upsert)\s*\(/.test(added)) {
      const hit = createdTables.find((t) => added.includes(t));
      if (hit) {
        kinds.add(CREATOR_KINDS.WRITER);
        evidence.push(`writer: ${path} inserts into newly-created table '${hit}'`);
      }
    }

    // FLAG: a new leo_feature_flags insert.
    if (/leo_feature_flags/.test(added) && /\.(?:insert|upsert)\s*\(/.test(added)) {
      kinds.add(CREATOR_KINDS.FLAG);
      evidence.push(`flag: ${path} inserts into leo_feature_flags`);
    }

    // DETECTOR: a NEW detector/heuristic MODULE (path-based only — a loose
    // `detectX(` call-site heuristic matches countless existing functions and
    // would false-positive; the design means a new detector module).
    if (/(?:detector|heuristic)s?\/[^/]*\.(?:js|cjs|mjs|ts)$/.test(path)) {
      kinds.add(CREATOR_KINDS.DETECTOR);
      evidence.push(`detector: ${path} defines a new detector/heuristic module`);
    }
  }

  return {
    is_creator: kinds.size > 0,
    creator_kinds: [...kinds],
    evidence,
  };
}

/**
 * FR-2 — CONSUMER validator. A consumer READS the created output and acts on it.
 * We look for a read-path (select/read/get against the created table/flag) in a
 * non-test changed file. A test file alone does not count as a consumer.
 *
 * @param {Object} input
 * @param {Array<{path: string, added?: string}>} input.changedFiles
 * @param {string[]} [input.createdTables] - table names the SD creates (from migrations)
 * @returns {{consumer_present: boolean, evidence: string[]}}
 */
/**
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001, HOLE B — detect a producer->consumer WIRING in a
 * change that creates nothing new.
 *
 * resolveOperatorContract short-circuits to a no-op pass when detectCreator() does not fire, so
 * the entire target class of this SD — wiring an EXISTING producer to an EXISTING consumer — was
 * never evaluated. Corpus #7 is exactly that shape: a sweep that already existed, writing a
 * receipt that already existed, with no reader.
 *
 * PURE and INTENTIONALLY NARROW. It reports what it can see and nothing more:
 *   MISS CLASSES (FR-4, stated honestly, never claimed complete)
 *   - a consumer reached by dynamic dispatch, config indirection, or a registry lookup
 *   - a producer/consumer split across repos (the reader lives in the venture app)
 *   - a wiring expressed only in prose (evaluateTrigger reads SD text; this reads the diff)
 *   - a write and read of the same value under different names (aliasing)
 * A wiring this cannot see is a MISS, not a pass — callers must not read `false` as "verified
 * unwired".
 */
export function detectWiring({ changedFiles = [] } = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  // `/tests/` REQUIRED A LEADING SLASH, so `tests/unit/x.js` — the repo-root-relative form git
  // diff actually emits, and the commonest shape in this repo — did NOT match. A test file was
  // therefore counted as a real consumer and could falsely clear a wiring. Found by the mutant-G
  // test that was written to pin the exclusion, which is the whole argument for writing it.
  const isTestPath = (p) => /(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests\/)/.test(p);
  const writes = new Map(); // table -> [paths]
  const reads = new Map();
  for (const f of files) {
    const path = String(f?.path || '');
    const added = String(f?.added || '');
    if (isTestPath(path)) continue;
    for (const m of added.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)\s*\.\s*(insert|upsert|update|select|maybeSingle|single)\s*\(/g)) {
      const [, table, verb] = m;
      const bucket = /^(insert|upsert|update)$/.test(verb) ? writes : reads;
      if (!bucket.has(table)) bucket.set(table, []);
      bucket.get(table).push(path);
    }
  }
  const wiredTables = [...writes.keys()].filter((t) => reads.has(t));

  // ORPHANED PRODUCERS — a table WRITTEN in this diff that NOTHING in this diff reads.
  //
  // This is the corpus #7 shape and it is the half that actually matters. The paired-wiring
  // check above only fires when a consumer EXISTS; a producer with NO consumer sailed straight
  // through it. Measured on the real shape before this was added: verdict `pass`, wiring
  // undefined, warnings []. The arm silently passed its own demonstration case — and the test
  // comment asserting that was "precisely the finding, not a miss" was a rationalisation, which
  // is the same explain-away that let corpus #7 survive a ratified completion in the first place.
  //
  // FALSE-POSITIVE SHAPE, stated plainly: a write whose readers live OUTSIDE the diff lands here
  // too. That is why the arm is warn-first, and why the citation for an orphan is allowed to name
  // a file the diff does not contain — the ask is "name the reader", and an existing reader is a
  // perfectly good answer. An orphan nobody can cite a reader for IS corpus #7.
  const orphanedTables = [...writes.keys()].filter((t) => !reads.has(t));

  return {
    wired: wiredTables.length > 0,
    tables: wiredTables,
    orphanedProducers: orphanedTables,
    orphanProducerFiles: [...new Set(orphanedTables.flatMap((t) => writes.get(t)))],
    producerFiles: [...new Set(wiredTables.flatMap((t) => writes.get(t)))],
    consumerFiles: [...new Set(wiredTables.flatMap((t) => reads.get(t)))],
    // The last three were MEASURED as undeclared misses by TESTING (row bc7f73bc) over 4180
    // files / 13431 .from() sites, not guessed. Declaring them is the honest move: a miss class
    // named is scope, a miss class hidden is a defect — and this list is what stops `wired:false`
    // from being read as "verified unwired".
    //   rpc_indirection      — 445 live .rpc() sites are wholly invisible to a .from() scan
    //   builder_variable_split — const q = supabase.from('t'); q.insert(r)  (literal table, still missed)  schema-lint-disable-line
    //   comment_interposition  — a comment between .from() and the verb defeats the regex, and
    //                            that idiom is in live code (roadmap-status-doc, ownership-detection,
    //                            claim-validity-gate, critical-qf-jump)
    miss_classes: [
      'dynamic_dispatch', 'config_indirection', 'cross_repo_consumer', 'prose_only_wiring', 'aliased_value',
      'rpc_indirection', 'builder_variable_split', 'comment_interposition',
    ],
  };
}

export function validateConsumer({ changedFiles = [], createdTables = [], consumerEvidence, producerFiles = [], allowOutOfDiffConsumer = false } = {}) {
  const evidence = [];
  const issues = [];
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const tables = Array.isArray(createdTables) ? createdTables : [];
  // SEC-3 (SECURITY row 778f9a78): the producer refusal — this gate's CENTRAL claim — was an
  // exact string compare, and SIX spellings walked past it while `lib/producer.js:9` correctly
  // blocked: `./lib/producer.js`, `lib/./producer.js`, `lib//producer.js`, `LIB/PRODUCER.JS`,
  // `lib\producer.js`, `lib/x/../producer.js`. Confirmed at gate level under ENFORCE=1 as
  // passed:true "consumer citation verified". The case variant is not academic — the harness
  // runs on Windows, where those name the same file.
  //
  // Case-folding ALWAYS (not just on win32) is deliberate: this list drives a REJECTION, so
  // over-matching rejects more citations, which is the safe direction. A gate whose refusal can
  // be spelled around is the "check a caller can satisfy without changing the harm" shape this
  // SD exists to abolish — shipping it here would be self-refuting.
  const normalizePath = (p) => {
    const parts = String(p || '').replace(/\\/g, '/').split('/');
    const out = [];
    for (const seg of parts) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { out.pop(); continue; }
      out.push(seg);
    }
    return out.join('/').toLowerCase();
  };
  const producers = Array.isArray(producerFiles) ? producerFiles.map((p) => String(p || '')) : [];
  const producerKeys = new Set(producers.map(normalizePath));
  // `/tests/` REQUIRED A LEADING SLASH, so `tests/unit/x.js` — the repo-root-relative form git
  // diff actually emits, and the commonest shape in this repo — did NOT match. A test file was
  // therefore counted as a real consumer and could falsely clear a wiring. Found by the mutant-G
  // test that was written to pin the exclusion, which is the whole argument for writing it.
  const isTestPath = (p) => /(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests\/)/.test(p);

  // --- DIFF SIDE ------------------------------------------------------------------------
  // SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001, HOLE A: this used to push evidence reading
  // "contains a read-path acting on created output" whenever createdTables was EMPTY — i.e.
  // for ANY read-shaped call anywhere in the diff, with nothing tying it to the produced
  // output. That is worse than a bare boolean: the sentence ASSERTS the tie, so a reviewer
  // reads it and believes it. With no created output there is nothing to tie to, so a read
  // is no longer treated as consumption. (Measured: a bare `readConfig();` passed.)
  const diffConsumers = [];
  for (const f of files) {
    const path = String(f?.path || '');
    const added = String(f?.added || '');
    if (isTestPath(path)) continue; // tests are not consumers
    const readsSomething = /\.(?:select|maybeSingle|single)\s*\(/.test(added) || /\bread[A-Z]\w*\s*\(/.test(added);
    if (!readsSomething) continue;
    const hit = tables.filter((t) => added.includes(String(t)));
    if (hit.length > 0) {
      diffConsumers.push(path);
      evidence.push(`consumer: ${path} reads created table(s): ${hit.join(', ')}`);
    }
  }
  if (tables.length === 0 && files.length > 0) {
    issues.push('no created output to tie a consumer to — a read-shaped call alone is not consumption (hole A)');
  }

  // --- CITATION SIDE --------------------------------------------------------------------
  // Absent consumerEvidence keeps the legacy diff-only contract (existing callers unchanged).
  // SUPPLYING it — with any value, including a malformed one — opts into the citation
  // contract and is validated strictly. Template: mechanism-claim-verifier.js FILE_LINE,
  // "a bare filename is NOT a citation — the line is the proof".
  if (consumerEvidence === undefined) {
    return { consumer_present: evidence.length > 0, evidence, issues, citation_supplied: false };
  }

  const cites = Array.isArray(consumerEvidence) ? consumerEvidence : [];
  if (!Array.isArray(consumerEvidence)) {
    // Covers 'none'/'n/a'/''/true/1/{}/null and every other non-array: a presence check cannot
    // be reused as an evidence check. real-callee-attestation.js accepts "none" BY DESIGN
    // (presence, never content) and is working to contract; this is a CONTENT check.
    issues.push('consumer evidence must be an array of citations, each naming a consumer site and the observed read');
    return { consumer_present: false, evidence, issues, citation_supplied: true };
  }
  if (cites.length === 0) {
    // "the field exists" is exactly the check that let "none" through next door.
    issues.push('consumer evidence array is EMPTY — an existing field is not an observation');
    return { consumer_present: false, evidence, issues, citation_supplied: true };
  }

  const accepted = [];
  for (const c of cites) {
    const site = typeof c?.consumer === 'string' ? c.consumer : '';
    const read = typeof c?.observed_read === 'string' ? c.observed_read.trim() : '';
    const m = /^(.+?):(\d+)$/.exec(site); // path:line — the line is the proof
    if (!m) { issues.push(`citation "${site || String(site)}" is not path/to/file.js:LINE — a bare filename is not a citation`); continue; }
    const citedPath = m[1];
    if (!read) { issues.push(`citation ${site} names a location but no observed read — a location is not an observation`); continue; }
    // Normalise BEFORE both checks — a `./` prefix or a backslash separator must not buy a pass
    // through either the test-file refusal or the producer refusal.
    const citedKey = normalizePath(citedPath);
    if (isTestPath(citedPath) || isTestPath(citedKey)) { issues.push(`citation ${site} points at a test file — a test is not the consumer`); continue; }
    if (producerKeys.has(citedKey)) { issues.push(`citation ${site} points at the PRODUCER — a producer-side artifact is not consumer evidence`); continue; }
    // The in-diff rule is correct for a paired wiring and WRONG for an orphaned producer, whose
    // reader is by definition outside the diff. Applying it there would make the orphan arm
    // unsatisfiable — a gate nobody can pass gets bypassed, not obeyed.
    const inDiff = files.some((f) => normalizePath(f?.path) === citedKey);
    if (!inDiff && !allowOutOfDiffConsumer) {
      issues.push(`citation ${site} names a file absent from this change — the cited consumer must be in the diff`); continue;
    }
    accepted.push(site);
    // Marked inline so an out-of-diff citation is never mistaken for one this change can verify:
    // the reader was asserted by an operator, not observed in the diff.
    evidence.push(`consumer-read verified at ${site}${inDiff ? '' : ' (OUT-OF-DIFF, operator-asserted)'}: ${read}`);
  }

  return { consumer_present: accepted.length > 0, evidence, issues, citation_supplied: true, accepted_citations: accepted };
}

/**
 * FR-3 — ARMED CADENCE validator. The capability must be driven by a
 * periodic_process_registry row that is ACTIVE (currently_expected_active=true)
 * with a positive expected_interval_seconds. A bare CLI (no registry row) or an
 * inactive/off registration does NOT satisfy this. `last_fired_at` (when present)
 * is surfaced as the WITNESS that the cadence has genuinely fired.
 *
 * Column names mirror the live periodic_process_registry schema
 * (lib/machinery-class/armed-registration.js): currently_expected_active,
 * expected_interval_seconds, last_fired_at.
 *
 * @param {Object} input
 * @param {Array<{process_key: string, currently_expected_active?: boolean, expected_interval_seconds?: number, last_fired_at?: string|null}>} input.registryRows
 * @param {string[]} input.capabilityKeys - candidate process_keys tied to the SD capability
 * @returns {{cadence_armed: boolean, process_key: string|null, witnessed: boolean, evidence: string[]}}
 */
export function validateCadence({ registryRows = [], capabilityKeys = [] } = {}) {
  for (const key of capabilityKeys) {
    const row = registryRows.find((r) => r?.process_key === key);
    if (!row) continue;
    const interval = Number(row.expected_interval_seconds);
    if (row.currently_expected_active === true && Number.isFinite(interval) && interval > 0) {
      const witnessed = row.last_fired_at != null;
      return {
        cadence_armed: true,
        process_key: key,
        witnessed,
        evidence: [
          `armed cadence: periodic_process_registry '${key}' active every ${interval}s` +
            (witnessed ? ` (witness: last fired ${row.last_fired_at})` : ' (ARMED, not yet fired)'),
        ],
      };
    }
  }
  return {
    cadence_armed: false,
    process_key: null,
    witnessed: false,
    evidence: [
      capabilityKeys.length === 0
        ? 'no capability key supplied for cadence lookup'
        : `no active registry row for: ${capabilityKeys.join(', ')} (bare CLI / inactive registration does not satisfy)`,
    ],
  };
}

/**
 * FR-4 — REAPER validator. The created data must have a retention/TTL/retire path:
 * an entry in lib/retention/policies.js RETENTION_POLICIES (or SOAK_ENTRIES) keyed
 * to the created table.
 *
 * @param {Object} input
 * @param {Array<{table: string}>} input.retentionPolicies - RETENTION_POLICIES (+ SOAK_ENTRIES)
 * @param {string[]} input.createdTables
 * @returns {{reaper_present: boolean, policy_key: string|null, evidence: string[]}}
 */
export function validateReaper({ retentionPolicies = [], createdTables = [] } = {}) {
  // No created tables → nothing to reap (table CREATOR check is table-scoped).
  if (createdTables.length === 0) {
    return { reaper_present: true, policy_key: null, evidence: ['no created table requires a reaper'] };
  }
  const covered = createdTables.filter((t) => retentionPolicies.some((p) => p?.table === t));
  const missing = createdTables.filter((t) => !covered.includes(t));
  if (missing.length === 0) {
    return {
      reaper_present: true,
      policy_key: covered.join(', '),
      evidence: [`reaper: retention policy covers ${covered.join(', ')}`],
    };
  }
  return {
    reaper_present: false,
    policy_key: null,
    evidence: [`reaper MISSING for created table(s): ${missing.join(', ')} (add to lib/retention/policies.js)`],
  };
}

/**
 * FR-6 — Waiver evaluator. A dated waiver with a FUTURE expiry lets a CREATOR SD
 * pass; an expired or malformed waiver does NOT. Shape:
 *   { owner: string, reason: string, expiry: ISO-8601, granted_at?: ISO-8601 }
 *
 * @param {Object|null|undefined} waiver
 * @param {Date} [now]
 * @returns {{valid: boolean, reason: string, audit: Object|null}}
 */
export function evaluateWaiver(waiver, now = new Date()) {
  if (waiver == null) return { valid: false, reason: 'no waiver', audit: null };
  if (typeof waiver !== 'object' || Array.isArray(waiver)) {
    return { valid: false, reason: 'waiver malformed (not an object)', audit: null };
  }
  const { owner, expiry } = waiver;
  if (!owner || typeof owner !== 'string') {
    return { valid: false, reason: 'waiver malformed (missing owner)', audit: null };
  }
  if (!expiry) {
    return { valid: false, reason: 'waiver malformed (missing expiry)', audit: null };
  }
  const expiryMs = Date.parse(expiry);
  if (Number.isNaN(expiryMs)) {
    return { valid: false, reason: `waiver malformed (unparseable expiry: ${expiry})`, audit: null };
  }
  if (expiryMs <= now.getTime()) {
    return { valid: false, reason: `waiver expired at ${expiry}`, audit: null };
  }
  return {
    valid: true,
    reason: `waiver valid until ${expiry}`,
    audit: { event: 'OPERATOR_CONTRACT_WAIVER_APPLIED', owner, expiry, reason: waiver.reason || null },
  };
}

/**
 * FR-5 — Composite operator-contract evaluation (the gate verdict).
 *
 * @param {Object} input
 * @param {ReturnType<typeof detectCreator>} input.creator
 * @param {{consumer_present: boolean, cadence_armed: boolean, reaper_present: boolean}} input.triple
 * @param {Object|null} [input.waiver] - raw SD metadata.operator_contract_waiver
 * @param {Date} [input.now]
 * @returns {{verdict: 'pass'|'fail', reason: string, missing: string[], waiver_audit: Object|null}}
 */
export function evaluateOperatorContract({ creator, triple, waiver = null, now = new Date() } = {}) {
  // Non-CREATOR SD → the gate is a no-op pass (FR-5 AC3, zero false-positives).
  if (!creator || !creator.is_creator) {
    return { verdict: 'pass', reason: 'OPERATOR_CONTRACT_NOT_APPLICABLE (non-CREATOR)', missing: [], waiver_audit: null };
  }

  const missing = [];
  if (!triple?.consumer_present) missing.push('consumer');
  if (!triple?.cadence_armed) missing.push('armed_cadence');
  if (!triple?.reaper_present) missing.push('reaper');

  if (missing.length === 0) {
    return { verdict: 'pass', reason: 'OPERATOR_CONTRACT_COMPLETE', missing: [], waiver_audit: null };
  }

  // Triple incomplete — a valid waiver rescues it (and must be audit-logged).
  const w = evaluateWaiver(waiver, now);
  if (w.valid) {
    return {
      verdict: 'pass',
      reason: `OPERATOR_CONTRACT_WAIVED (${w.reason}); missing: ${missing.join(', ')}`,
      missing,
      waiver_audit: w.audit,
    };
  }

  return {
    verdict: 'fail',
    reason: `OPERATOR_CONTRACT_INCOMPLETE — missing: ${missing.join(', ')} (${w.reason})`,
    missing,
    waiver_audit: null,
  };
}
