/**
 * Operator Contract — harness adapter (FR-5 enforcement point).
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001)
 *
 * Assembles the DB/git inputs for the pure core validator and produces a gate
 * verdict for the handoff final-gate. This is the DB-reading layer; all decision
 * logic lives in ./index.js so the harness gate and the venture seam (FR-7) share
 * ONE validator with zero duplicated logic.
 *
 * FAIL-OPEN CONTRACT: this gate binds the SHARED PLAN-TO-LEAD pipeline that every
 * session hits. Any execution error (git unavailable, DB read failure, parse
 * error) resolves to PASS with a warning — never a false block. Only an
 * unambiguous CREATOR-without-triple-and-no-valid-waiver produces a hard block.
 */
// SD-LEO-FIX-SHELL-INJECTION-RCE-001: execFileSync, NOT execSync and NOT spawnSync.
// execFileSync takes an argv ARRAY and never involves a shell, which is the whole fix.
// It is also the only drop-in for the contract below: like execSync it returns stdout as a
// string and THROWS on a non-zero exit, so the fail-open per-file catch that records
// `unreadable` keeps firing. spawnSync returns {stdout,stderr,status} and does NOT throw —
// swapping it in here would silently stop that SEC-4b bookkeeping from ever recording a
// genuine per-file diff failure.
import { execFileSync } from 'node:child_process';
import { evaluateOperatorContract, detectCreator, validateConsumer, detectWiring, validateCadence, validateReaper } from './index.js';
import { RETENTION_POLICIES, SOAK_ENTRIES } from '../../retention/policies.js';

/**
 * Collect changed files (with added-line text) and migration SQL for an SD branch
 * by diffing the branch tip against origin/main. Pure-ish: only shells out to git.
 *
 * @param {Object} opts
 * @param {string} opts.appPath - repo root to run git in
 * @param {string} [opts.baseRef='origin/main']
 * @returns {{changedFiles: Array<{path,added}>, migrations: Array<{path,sql}>, createdTables: string[], unreadable: Array<{path,error}>}}
 */
export function collectSdDiff({ appPath, baseRef = 'origin/main' } = {}) {
  // SEC-4b (SECURITY row 778f9a78): execSync's default maxBuffer is 1 MiB, and the per-file
  // catch below was EMPTY. A real `.from('x').insert()` line inside a patch of 1,789,084 bytes  schema-lint-disable-line
  // produced ENOBUFS, was swallowed, and left added='' — so the line was invisible. The same
  // swallow blinds the three PRE-EXISTING blocking triple checks: a CREATE TABLE in a >1 MiB
  // migration is invisible to detectCreator. Raised, and truncation is now recorded rather than
  // silently absorbed, because "read nothing" and "read successfully, found nothing" must not
  // look identical.
  // SD-LEO-FIX-SHELL-INJECTION-RCE-001. This helper used to take a COMMAND STRING and hand it to
  // execSync, which runs it through /bin/sh on POSIX and cmd.exe on Windows. The per-file call
  // below interpolated a GIT-SUPPLIED FILENAME into that string, so a committed file whose NAME
  // contained $(...) or a backtick executed as a command — in a process holding
  // SUPABASE_SERVICE_ROLE_KEY. Reproduced, not theorised: a throwaway repo with a
  // backtick-`touch` filename returned it byte-verbatim from `git diff --name-only`, and running
  // the interpolated command under real sh created the marker file.
  //
  // The fix is not escaping — escaping IS the failure mode. It is to never build a command
  // string: `git` is the executable and every other token is a discrete argv element, so the OS
  // hands them to git as data and no shell ever parses them.
  //
  // SEC-R2 (adversarial security review of the fix above): argv-safety stops SHELLS, not
  // ARGUMENT injection. baseRef is still interpolated into an argv element, and a value LEADING
  // WITH A DASH is parsed by git as an OPTION rather than a ref — reproduced during review:
  // baseRef='--output=<path>' made git honour --output, CREATE that file, and throw nothing.
  // Not reachable today (the sole production caller at the bottom of this file passes no baseRef,
  // so the 'origin/main' default always applies), but it is a local command-execution primitive
  // the moment anyone wires baseRef to env, DB config or a flag. This repo already adopted the
  // control for the IDENTICAL sink — lib/fleet/tree-currency.cjs:53 VALID_BASE_REF, applied at
  // :105 for its own SEC-1 finding — and it simply was not carried here. Reuse the same shape,
  // because safety-by-coincidence outlives the rule written to abolish it.
  const VALID_BASE_REF = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
  if (!VALID_BASE_REF.test(String(baseRef || ''))) {
    // Thrown, not silently defaulted. The outer gate is fail-open and will record this as a
    // warning; substituting origin/main here would make a rejected ref indistinguishable from an
    // accepted one, which is the exact confusion the rest of this function exists to prevent.
    throw new Error(`collectSdDiff: refusing baseRef with option-like or unsafe shape: ${baseRef}`);
  }
  // --literal-pathspecs is NOT decoration; it closes SEC-R1, found by adversarial review AFTER
  // the argv fix landed. `--` ends OPTION parsing but does NOT disable PATHSPEC MAGIC: git still
  // reads `:(literal)`, `:(icase)` and friends as SYNTAX in an argument after `--`. Measured,
  // two-sided, same content and same fixture — only the NAME differs: `hidden.sql` yields its
  // CREATE TABLE and detectCreator.is_creator=true, while `:(literal)hidden.sql` makes the
  // per-file diff exit 0 with a ZERO-BYTE patch and throw NOTHING, so the catch never fires,
  // `unreadable` stays empty, and the gate reports a clean read of a file it never read —
  // flipping the blocking CREATOR check.
  //
  // That is the same silent-blinding CLASS as the %VAR% vector below, and strictly worse: %VAR%
  // needs cmd.exe, this works everywhere. Fixing it in the RUNNER rather than at the two call
  // sites is deliberate — a per-call-site fix is one forgotten argument away from regressing,
  // and this way every git invocation in this function is literal by construction.
  const run = (args) => execFileSync('git', ['--literal-pathspecs', ...args], {
    cwd: appPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  });
  const unreadable = [];
  // merge-base diff so we only see the SD's own changes.
  //
  // -z is NUL-delimited AND suppresses git's path quoting entirely. That matters twice over:
  // git's quoting is inconsistent BETWEEN SUBCOMMANDS (measured: `git status --short` quotes a
  // backtick-bearing filename while plain `git diff --name-only` returns the identical name
  // unquoted), and splitting on '\n' silently mis-parses any filename containing a literal
  // newline — legal in a git tree entry — into bogus path fragments.
  //
  // No .trim() here, deliberately. The old newline split needed it to clean up whitespace
  // artefacts; with NUL delimiters the bytes between separators ARE the path, and trimming would
  // corrupt a filename that legitimately begins or ends with a space.
  const nameOnly = run(['diff', '--name-only', '-z', `${baseRef}...HEAD`]).split('\0').filter(Boolean);
  const changedFiles = [];
  const migrations = [];
  const createdTables = [];

  for (const path of nameOnly) {
    let added = '';
    try {
      // only the added lines (leading '+', excluding the +++ header)
      // THIS WAS THE RCE LINE. It read: run(`git diff ${baseRef}...HEAD -- "${path}"`) — the
      // filename interpolated inside double quotes in a shell string. Double quotes do NOT save
      // you: under POSIX sh they suppress ; and & but $(...) and backticks still expand inside
      // them, and an embedded " ends the quoting and re-arms everything else.
      //
      // The path is now its own argv element after --, so no SHELL parses it. That is the whole
      // of what argv-safety buys, and the first version of this comment overclaimed by saying
      // "nothing parses it as syntax" — GIT still did. `--` ends option parsing but leaves
      // PATHSPEC MAGIC live, so `:(literal)foo.sql` was still read as syntax and silently
      // returned an empty diff. That is closed by --literal-pathspecs in the runner above (see
      // SEC-R1 there), not by `--`. This also closes a SECOND, quieter vector for free: under
      // cmd.exe a file named f%PATH%.js had %PATH% expanded BEFORE git saw the argument, so git
      // matched no pathspec and exited 0 with an EMPTY diff — no error, so the catch below never
      // fired and the file read as having no added lines. A gate that could be made to see
      // nothing is worse than one that crashes.
      const patch = run(['diff', `${baseRef}...HEAD`, '--', path]);
      added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
    } catch (e) {
      // Named, not swallowed: an unreadable file is a KNOWN BLIND SPOT for this run.
      unreadable.push({ path, error: e?.message || String(e) });
    }

    if (/\.sql$/i.test(path)) {
      migrations.push({ path, sql: added });
      // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001: this extraction produced GARBAGE and the gate then
      // demanded retention policies for it. Measured on a real migration, it returned
      // ["would", "IF", "public", "returns", "belt_capacity_verdicts_backup"] — every entry wrong,
      // and the actual created table absent. Two independent causes:
      //
      //   1. IT SCANNED SQL COMMENT PROSE. A migration that DISCUSSES `CREATE TABLE ...` in its
      //      header — including one warning against `CREATE TABLE IF NOT EXISTS`, and a _DOWN
      //      advising `CREATE TABLE <x>_backup AS SELECT ...` before a destructive rollback — had
      //      each mention read as a statement. The file that documents itself most carefully is
      //      punished hardest, which is backwards. Comments are stripped first now.
      //   2. THE NAME PATTERN EXCLUDED THE DOT, so `CREATE TABLE public.foo` captured `public` —
      //      the schema, for every schema-qualified migration in the repo. It then demanded a
      //      reaper for a "table" called public.
      //
      // The failure is silent in the direction that matters: a wrong name means the REAPER check
      // asks about a table nobody has, so a genuinely unreaped table can pass while a correctly
      // reaped one fails. Fail-toward-safe was the design intent (TR-2) and this inverted it.
      // Order matters: comments FIRST (their apostrophes — "the file's own" — would unbalance the
      // string-literal pass), then string literals. A table name inside a quoted string is never a
      // CREATE TABLE statement; it is a RAISE EXCEPTION message, and in the migration that exposed
      // this it was a message WARNING against the very statement it got mistaken for.
      const sqlNoComments = added
        .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
        .replace(/--[^\n]*/g, ' ')           // line comments — where most of the bad names came from
        .replace(/'(?:[^']|'')*'/g, ' ');    // single-quoted literals (SQL escapes a quote as '')
      const m = sqlNoComments.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+(?:\.[a-z0-9_]+)?)/gi) || [];
      for (const stmt of m) {
        const name = stmt
          .replace(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?/i, '')
          .trim()
          // Drop the schema qualifier: retention policies and every other consumer key on the
          // BARE table name, so `public.foo` and `foo` must resolve to one identity.
          .replace(/^[a-z0-9_]+\./i, '');
        if (name) createdTables.push(name);
      }
    } else {
      changedFiles.push({ path, added });
    }
  }
  return { changedFiles, migrations, createdTables: [...new Set(createdTables)], unreadable };
}

/**
 * Resolve the full operator-contract verdict for an SD.
 *
 * @param {Object} opts
 * @param {Object} opts.sd - strategic_directives_v2 row (metadata may hold operator_contract_waiver + capability keys)
 * @param {string} opts.appPath
 * @param {Object} opts.supabase
 * @param {Date} [opts.now]
 * @returns {Promise<{verdict, reason, missing, creator, waiver_audit}>}
 */
export async function resolveOperatorContract({ sd, appPath, supabase, now = new Date(), diff }) {
  // `diff` is an injectable seam (tests only; default reproduces prior behaviour EXACTLY).
  // Without it the hole-B arming below is untestable: collectSdDiff shells out to git, so a test
  // can only reach the pure detectWiring — and a mutation that stops the ADAPTER from calling it
  // leaves every such test green. That is the unit-tests-the-function-but-not-the-wiring class,
  // which is the very defect this SD exists to catch; it reproduced here during EXEC.
  // `unreadable` IS DESTRUCTURED, and that is not incidental. VALIDATION and REGRESSION both
  // caught that it had ZERO readers — a produced output nothing consumes, corpus n=12's exact
  // shape, shipped inside the arm built to detect it. The SEC-4b comment claimed "named, not
  // swallowed" while the name reached no consumer, which is an assertion layer stating what it
  // never measured. It now reaches the verdict on every path below.
  const { changedFiles, migrations, createdTables, unreadable = [] } = diff || collectSdDiff({ appPath });
  const creator = detectCreator({ changedFiles, migrations });

  // HOLE B (SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001): this short-circuit used to be
  // unconditional, so a change that CREATES nothing was never evaluated — and "wire an EXISTING
  // producer to an EXISTING consumer" is this SD's entire target class. Corpus #7 is that exact
  // shape: an existing sweep writing an existing receipt that nothing reads.
  //
  // WARN-FIRST by deliberate choice. Arming on wiring widens the evaluated population sharply,
  // so the default routes findings to `warnings` and does NOT block; ENFORCE_CONSUMER_CITATION=1
  // promotes it. The flag is a distinct key rather than gate.required, because flipping
  // gate.required here would de-fang the three already-blocking triple checks as collateral.
  if (!creator.is_creator) {
    const wiring = detectWiring({ changedFiles });
    // ORPHANS ARE THE POINT. Arming only on `wired` meant a producer with NO consumer — the
    // corpus #7 shape, and the whole reason this SD exists — returned a silent pass. Measured
    // before this line changed: verdict `pass`, warnings []. The demonstration case walked
    // straight through its own arm.
    const orphans = wiring.orphanedProducers || [];
    if (!wiring.wired && orphans.length === 0) {
      // The miss classes must ride on THIS verdict above all others. VALIDATION (72db4226)
      // falsified the claim that they ride on every one: this early return dropped them, so on
      // the single path where `wired:false` could be misread as "verified unwired" — the exact
      // misreading the list exists to prevent — the list was absent. Same shape as the D1 defect
      // one layer down, and found the same way: by someone checking at the consumer.
      return {
        ...evaluateOperatorContract({ creator, triple: {}, now }),
        wiring_miss_classes: wiring.miss_classes,
        unreadable_files: unreadable,
      };
    }
    // `?? []` IS THE LOAD-BEARING PART, and passing the raw value through was a real defect the
    // adapter tests caught: `undefined` routes validateConsumer to its LEGACY heuristic, which
    // answers "is there a read-path in this diff?" — the very bit detectWiring just used to
    // declare the wiring. Verifier and detector would read ONE signal, so the check could never
    // disagree with the thing it was checking, and every wired SD would self-certify. `[]` means
    // "asserts absence", forcing the citation contract: a file:line an operator actually observed.
    const armedTables = [...new Set([...wiring.tables, ...orphans])];
    const consumerCheck = validateConsumer({
      changedFiles,
      createdTables: armedTables,
      consumerEvidence: sd?.metadata?.consumer_evidence ?? [],
      producerFiles: [...new Set([...wiring.producerFiles, ...(wiring.orphanProducerFiles || [])])],
      // An orphan's reader is outside the diff by definition; requiring it inside would make the
      // arm unsatisfiable. Only relaxed when an orphan is actually present.
      allowOutOfDiffConsumer: orphans.length > 0,
    });
    const enforced = process.env.ENFORCE_CONSUMER_CITATION === '1';
    const base = evaluateOperatorContract({ creator, triple: {}, now });
    const shape = orphans.length > 0
      ? `ORPHANED PRODUCER (${orphans.join(', ')}) — written here, read by nothing in this change`
      : `WIRING DETECTED (${wiring.tables.join(', ')})`;
    const note = consumerCheck.consumer_present
      ? `consumer citation verified for ${armedTables.join(', ')}`
      : `${shape} with no consumer-side citation: ${consumerCheck.issues.join('; ') || 'no evidence supplied'}`;
    return {
      ...base,
      // Never silent in either mode — an unenforced finding still has to be visible, or this
      // repeats the decorative-arm failure the SD exists to stop.
      warnings: [...(base.warnings || []), ...(consumerCheck.consumer_present ? [] : [`[consumer-citation${enforced ? '' : ' advisory'}] ${note}`])],
      wiring_detected: true,
      wiring_tables: wiring.tables,
      orphaned_producers: orphans,
      unreadable_files: unreadable,
      wiring_miss_classes: wiring.miss_classes,
      consumer_citation: { present: consumerCheck.consumer_present, enforced, issues: consumerCheck.issues, accepted: consumerCheck.accepted_citations || [] },
      ...(enforced && !consumerCheck.consumer_present ? { verdict: 'FAIL', reason: 'CONSUMER_CITATION_MISSING' } : {}),
    };
  }

  // BLOCKING REGRESSION, found independently by VALIDATION (72db4226) and REGRESSION (a54189e3)
  // and measured end-to-end by both: closing hole A made the CONSUMER leg UNSATISFIABLE on the
  // blocking creator path whenever createdTables is empty — i.e. every FLAG and DETECTOR creator.
  // Base pushed "contains a read-path acting on created output" for any read when there was
  // nothing to tie it to; refusing that is right, but here it converted a false PASS into a FALSE
  // BLOCK on a required:true gate on the shared PLAN-TO-LEAD pipeline, outside the warn-first
  // flag. Measured: a FLAG creator that DOES ship a reader returned passed:false missing:[consumer],
  // and a perfect metadata.consumer_evidence could not rescue it because this call did not pass it.
  // A gate that cannot be satisfied by doing the right thing leaves a waiver as the only exit.
  const consumer = validateConsumer({
    changedFiles,
    createdTables,
    consumerEvidence: sd?.metadata?.consumer_evidence,
    // Passing producerFiles is load-bearing, and omitting it was a hole in this very fix — the
    // two-sided test caught the creator path ACCEPTING a citation that pointed at the writer.
    // Making a blocked gate satisfiable is only correct if it stays unsatisfiable by the thing
    // it exists to refuse.
    producerFiles: changedFiles
      .filter((f) => /\.(?:insert|upsert|update)\s*\(/.test(String(f?.added || '')))
      .map((f) => String(f?.path || '')),
    // A flag/detector creator's output is not a table, so the cited reader is legitimately not
    // tied to createdTables and legitimately may sit outside the diff.
    allowOutOfDiffConsumer: createdTables.length === 0,
  });

  // Capability keys for the cadence lookup: explicit metadata list, else derived from created tables.
  const meta = sd?.metadata || {};
  const capabilityKeys = Array.isArray(meta.operator_capability_keys) && meta.operator_capability_keys.length
    ? meta.operator_capability_keys
    : createdTables.flatMap((t) => [t, `${t}-sweep`, `${t}-reaper`, t.replace(/_/g, '-')]);

  let registryRows = [];
  try {
    const { data } = await supabase
      .from('periodic_process_registry')
      .select('process_key, currently_expected_active, expected_interval_seconds, last_fired_at');
    registryRows = data || [];
  } catch { /* fail-open: no rows → cadence fails, but still a real verdict */ }
  const cadence = validateCadence({ registryRows, capabilityKeys });

  const reaper = validateReaper({ retentionPolicies: [...RETENTION_POLICIES, ...SOAK_ENTRIES], createdTables });

  return {
    ...evaluateOperatorContract({
      creator,
      triple: {
        consumer_present: consumer.consumer_present,
        cadence_armed: cadence.cadence_armed,
        reaper_present: reaper.reaper_present,
      },
      waiver: meta.operator_contract_waiver || null,
      now,
    }),
    unreadable_files: unreadable,
  };
}

/**
 * PLAN-TO-LEAD gate factory (FR-5). Additive, fail-open.
 * @param {Object} supabase
 * @param {Object} sd
 * @param {string} appPath
 */
export function createOperatorContractGate(supabase, sd, appPath, { diff } = {}) {
  return {
    name: 'OPERATOR_CONTRACT',
    required: true,
    validator: async (ctx) => {
      console.log('\n🔗 OPERATOR CONTRACT GATE (D8 build-vs-run)');
      console.log('-'.repeat(50));
      const targetSd = ctx?.sd || sd || {};
      const repoPath = appPath || process.cwd();

      let audited = false;
      try {
        // `diff` is the same test-only seam resolveOperatorContract exposes, threaded one layer
        // up. Without it the gate-factory output layer is only reachable through git, which is
        // why it shipped with no behavioural coverage and lost the warnings channel unnoticed.
        const result = await resolveOperatorContract({ sd: targetSd, appPath: repoPath, supabase, diff });

        // Audit-log a valid waiver application (FR-6) — best-effort, non-blocking.
        if (result.waiver_audit) {
          try {
            await supabase.from('audit_log').insert({
              event: result.waiver_audit.event,
              metadata: { sd_key: targetSd.sd_key, ...result.waiver_audit },
            });
            audited = true;
          } catch { /* audit is best-effort */ }
        }

        if (result.verdict === 'pass') {
          // D1 (TESTING bc7f73bc): this used to OVERWRITE warnings with the waived-missing list,
          // so every consumer-citation advisory the arm produced was built and thrown away. The
          // gate returned warnings:[] and reason NOT_APPLICABLE for a diff it HAD evaluated and
          // HAD found an orphan in — the arm was invisible in its own shipped default. Measured
          // on this SD's own branch, which arms and would have reported NOT_APPLICABLE: the arm
          // silently passing its own demonstration case, one layer above where 9640b3b1 fixed
          // exactly that. The warnings channel is real and consumed (BaseExecutor -> handoff
          // record -> ContentBuilder known_issues); nothing was missing but the wiring.
          const warnings = [
            ...(result.missing?.length ? [`waived missing: ${result.missing.join(', ')}`] : []),
            ...(result.warnings || []),
            // A file this run could not read is a KNOWN BLIND SPOT and must be visible, or the
            // verdict silently means less than it appears to.
            ...(result.unreadable_files?.length
              ? [`operator-contract could not read ${result.unreadable_files.length} changed file(s) — verdict is INCOMPLETE for: ${result.unreadable_files.map((u) => u.path).join(', ')}`]
              : []),
          ];
          // A verdict that says NOT_APPLICABLE about a diff it evaluated is a false statement,
          // not merely a terse one.
          const reason = result.wiring_detected
            ? `OPERATOR_CONTRACT_EVALUATED (non-CREATOR wiring): ${result.consumer_citation?.present ? 'consumer citation verified' : 'advisory raised'}`
            : result.reason;
          if (result.wiring_detected) {
            console.log(`   ⚠️  ${reason}`);
            for (const w of result.warnings || []) console.log(`      ${w}`);
          } else {
            console.log(`   ✅ ${reason}`);
          }
          return {
            passed: true, score: 100, max_score: 100, issues: [],
            warnings,
            details: {
              reason, missing: result.missing, waiver_audited: audited,
              wiring_detected: result.wiring_detected,
              wiring_tables: result.wiring_tables,
              orphaned_producers: result.orphaned_producers,
              consumer_citation: result.consumer_citation,
              wiring_miss_classes: result.wiring_miss_classes,
            },
          };
        }

        console.log(`   ❌ ${result.reason}`);
        // D2 (TESTING bc7f73bc): the triple/waiver text below cannot resolve a
        // CONSUMER_CITATION_MISSING block — neither shipping a triple nor attaching a waiver
        // touches it. A gate that names the wrong remedy trains people to bypass it.
        if (result.reason === 'CONSUMER_CITATION_MISSING') {
          const target = (result.orphaned_producers?.length ? result.orphaned_producers : result.wiring_tables) || [];
          console.log(`   This change writes ${target.join(', ')} and nothing here reads it.`);
          console.log('   NAME THE READER in the SD\'s metadata.consumer_evidence:');
          console.log('     [{ "consumer": "path/to/reader.js:LINE",');
          console.log('        "observed_read": "what you actually saw — e.g. select returned 14 rows",');
          console.log('        "artifact": "query_result" }]');
          console.log('   The reader may live OUTSIDE this diff (that is the normal case here).');
          console.log('   It must NOT be a test file, and must NOT be the producer — producer-side');
          console.log('   proof that the write HAPPENED is exactly what this gate exists to refuse.');
          return {
            passed: false, score: 0, max_score: 100,
            issues: [result.reason],
            warnings: result.warnings || [],
            details: {
              reason: result.reason,
              wiring_tables: result.wiring_tables,
              orphaned_producers: result.orphaned_producers,
              consumer_citation: result.consumer_citation,
              wiring_miss_classes: result.wiring_miss_classes,
              remedy_field: 'metadata.consumer_evidence',
            },
          };
        }
        console.log('   A CREATOR (new table/writer/flag/detector) must ship its OPERATOR TRIPLE:');
        console.log('     • CONSUMER — code that acts on the created output');
        console.log('     • ARMED CADENCE — a periodic_process_registry cron (not a bare CLI / off-by-default flag)');
        console.log('     • REAPER — a lib/retention/policies.js entry');
        console.log('   Or attach a dated waiver: metadata.operator_contract_waiver {owner, expiry, reason}');
        return {
          passed: false, score: 0, max_score: 100,
          issues: [result.reason],
          warnings: [],
          details: { reason: result.reason, missing: result.missing, creator_kinds: result.creator?.creator_kinds },
        };
      } catch (err) {
        // SEC-4 (SECURITY row 778f9a78): fail-open is right for the WARN-FIRST default and wrong
        // under enforcement. Demonstrated: with ENFORCE_CONSUMER_CITATION=1 an orphan correctly
        // blocks, but making git throw returns passed:true — and NO MALICE IS REQUIRED, since
        // `git diff origin/main...HEAD` throws whenever the ref is simply absent (shallow clone,
        // --branch clone, unfetched worktree). An enforced block a missing ref can erase is not
        // a control.
        //
        // So the fail DIRECTION follows the mode: warn-first stays fail-OPEN (it must never
        // false-block the shared PLAN-TO-LEAD pipeline every session hits), enforcement fails
        // CLOSED (setting the flag IS opting into blocking, and "could not evaluate" must not
        // read as "evaluated and fine").
        const enforced = process.env.ENFORCE_CONSUMER_CITATION === '1';
        if (enforced) {
          console.log(`   ❌ UNEVALUABLE under enforcement: ${err.message}`);
          console.log('   Enforcement fails CLOSED — an error is not a pass. Fetch origin/main');
          console.log('   (a shallow or --branch clone cannot compute the merge-base diff).');
          return {
            passed: false, score: 0, max_score: 100,
            issues: ['OPERATOR_CONTRACT_UNEVALUABLE'],
            warnings: [],
            details: { fail_open: false, enforced: true, error: err.message },
          };
        }
        console.log(`   ⚠️  fail-open (execution error): ${err.message}`);
        return {
          passed: true, score: 100, max_score: 100, issues: [],
          warnings: [`operator-contract gate fail-open: ${err.message}`],
          details: { fail_open: true, enforced: false, error: err.message },
        };
      }
    },
  };
}
