import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const P = 'lib/solomon/trend-eyes-probes.js';
const L = 'lib/solomon/trend-eyes-liveness.js';
const S = 'scripts/solomon/trend-eyes-sweep.mjs';

// [id, file, find, replace, note]
const MUTANTS = [
  // ===== lib/solomon/trend-eyes-probes.js =====
  ['M1',  P, 'export const T1_MIN_CLUSTER = 2;', 'export const T1_MIN_CLUSTER = 1;', 'T1 cluster floor 2->1'],
  ['M2',  P, 'export const T1_MIN_CLUSTER = 2;', 'export const T1_MIN_CLUSTER = 3;', 'T1 cluster floor 2->3'],
  ['M3',  P, 'export const T1_MIN_SEPARATION_MS = 24 * 60 * 60 * 1000;', 'export const T1_MIN_SEPARATION_MS = 1 * 60 * 60 * 1000;', 'T1 separation 24h->1h'],
  ['M3b', P, 'export const T1_MIN_SEPARATION_MS = 24 * 60 * 60 * 1000;', 'export const T1_MIN_SEPARATION_MS = 48 * 60 * 60 * 1000;', 'T1 separation 24h->48h'],
  ['M4',  P, 'if (spread >= T1_MIN_SEPARATION_MS) {', 'if (spread > T1_MIN_SEPARATION_MS) {', 'T1 boundary >= -> >'],
  ['M5',  P, 'if (occ.length < T1_MIN_CLUSTER) continue;', 'if (occ.length <= T1_MIN_CLUSTER) continue;', 'T1 cluster cmp < -> <='],
  ['M6',  P, 'const spread = Math.max(...times) - Math.min(...times);', 'const spread = Math.min(...times) - Math.max(...times);', 'T1 spread sign flip'],
  ['M7',  P, 'if (!Array.isArray(clusters)) return unusable(trigger, `unusable clusters ${JSON.stringify(clusters)}`);', "if (!Array.isArray(clusters)) return bar(trigger, VERDICT.FLAT, 'flat');", 'T1 non-array -> FLAT not UNKNOWN'],
  ['M8',  P, 'if (after.length > 0 && before.length > 0) {', 'if (after.length > 0) {', 'T2 drop before-fix requirement'],
  ['M8b', P, 'if (after.length > 0 && before.length > 0) {', 'if (before.length > 0) {', 'T2 drop after-fix requirement'],
  ['M9',  P, 'return Math.abs(delta) >= T3_DRIFT_DELTA', 'return (-delta) >= T3_DRIFT_DELTA', 'T3 downward-only detector'],
  ['M9b', P, 'return Math.abs(delta) >= T3_DRIFT_DELTA', 'return (delta) >= T3_DRIFT_DELTA', 'T3 upward-only detector'],
  ['M10', P, 'export const T3_DRIFT_DELTA = 0.25;', 'export const T3_DRIFT_DELTA = 0.01;', 'T3 drift delta 0.25->0.01'],
  ['M10b',P, 'export const T3_DRIFT_DELTA = 0.25;', 'export const T3_DRIFT_DELTA = 0.99;', 'T3 drift delta 0.25->0.99'],
  ['M11', P, 'export const T3_MIN_READINGS = 3;', 'export const T3_MIN_READINGS = 2;', 'T3 min readings 3->2'],
  ['M12', P, 'if (r.reachedPatterns > r.laneNamed) {', 'if (false) {', 'T3 SPAN GUARD removed'],
  ['M13', P, 'if (r.laneNamed === 0) return unusable(trigger, `reading ${r.windowStart}..${r.windowEnd} has an empty denominator`);', 'if (r.laneNamed === 0) { ratios.push(0); continue; }', 'T3 empty denominator -> 0 not UNKNOWN'],
  ['M14', P, 'if (endMs <= startMs) return unusable(trigger, ', 'if (endMs < startMs) return unusable(trigger, ', 'T3 window guard <= -> <'],
  ['M15', P, 'if (!c.fixedAt) continue;', 'if (false) continue;', 'T2 never-fixed classes admitted'],
  ['M16', P, 'const after = times.filter((t) => t > fixedMs);', 'const after = times.filter((t) => t >= fixedMs);', 'T2 after-fix boundary > -> >='],
  ['M17', P, 'const baseline = prior.reduce((a, b) => a + b, 0) / prior.length;', 'const baseline = ratios.reduce((a, b) => a + b, 0) / ratios.length;', 'T3 baseline includes latest'],
  ['M18', P, "if (clusters === null || clusters === undefined) return unusable(trigger, 'no chairman SMS clusters supplied');", "if (clusters === null || clusters === undefined) return bar(trigger, VERDICT.FLAT, 'no clusters');", 'T1 absent facts -> FLAT'],
  ['M19', P, 'if (fixedMs === null) return unusable(trigger, ', 'if (false) return unusable(trigger, ', 'T2 unparseable fixedAt guard removed'],
  ['M20', P, 'return bar(trigger, VERDICT.UNKNOWN, `${what} — NOT verified (this is not a flat reading)`);', 'return bar(trigger, VERDICT.FLAT, `${what}`);', 'UNKNOWN collapsed into FLAT globally'],

  // ===== lib/solomon/trend-eyes-liveness.js =====
  ['M21', L, '  if (ageMs < 0) {', '  if (false) {', 'LIVENESS future-dated guard removed'],
  ['M22', L, '  if (!lastReceiptAt) {', '  if (false) {', 'LIVENESS null-receipt guard removed'],
  ['M22b',L, 'export const STALE_RECEIPT_THRESHOLD_MS = 36 * 60 * 60 * 1000;', 'export const STALE_RECEIPT_THRESHOLD_MS = 360 * 60 * 60 * 1000;', 'LIVENESS threshold 36h->360h'],
  ['M22c',L, '  if (ageMs > thresholdMs) {', '  if (ageMs >= thresholdMs) {', 'LIVENESS threshold boundary > -> >='],
  ['M22d',L, '  if (!Number.isFinite(ageMs)) {', '  if (false) {', 'LIVENESS unparseable-timestamp guard removed'],

  // ===== scripts/solomon/trend-eyes-sweep.mjs — NEW CODE, priority hunt =====
  ['M23', S, "export const CANDIDATE_CATEGORY = 'solomon_trend_candidate';", "export const CANDIDATE_CATEGORY = 'telemetry_gauge';", 'CATEGORY repointed at aggregating category'],
  ['M24', S, "['sms-coverage', /\\b(sms|texts?|messages?)\\b/,", "['sms-coverage', /\\b(sms|text|message)\\b/,", 'questionClass sms plural dropped'],
  ['M25', S, 'miss(ed|ing)?|get(ting)? through', 'get(ting)? through', 'questionClass sms predicate: miss removed'],
  ['M26', S, "['fleet-liveness', /\\b(workers?|seats?|fleets?|sessions?)\\b/,", "['fleet-liveness', /\\b(worker|seat|fleet|session)\\b/,", 'questionClass fleet plural dropped'],
  ['M27', S, "['belt-depth', /\\bbelts?\\b/,", "['belt-depth', /\\bbelt\\b/,", 'questionClass belt plural dropped'],
  ['M28', S, 'if (predicate === null || predicate.test(t)) return cls;', 'if (predicate !== null && predicate.test(t)) return cls;', 'questionClass null-predicate classes disabled'],
  ['M29', S, 'if (!subject.test(t)) continue;', 'if (false) continue;', 'questionClass subject anchor removed'],
  ['M30', S, 'return /\\bare you still there\\b|\\bautomated\\b|\\bwatchdog\\b|\\bheartbeat\\b/.test(t);', 'return false;', 'isAutomatedMessage always false (watchdog ADMITTED)'],
  ['M31', S, 'return /\\bare you still there\\b|\\bautomated\\b|\\bwatchdog\\b|\\bheartbeat\\b/.test(t);', 'return true;', 'isAutomatedMessage always true (corpus emptied)'],
  ['M32', S, 'return /\\bare you still there\\b|\\bautomated\\b|\\bwatchdog\\b|\\bheartbeat\\b/.test(t);', 'return /\\bautomated\\b|\\bwatchdog\\b|\\bheartbeat\\b/.test(t);', 'isAutomatedMessage: are-you-still-there alternative removed'],
  ['M33', S, 'if (isAutomatedMessage(m.body)) { automated++; continue; }', 'if (isAutomatedMessage(m.body)) { automated++; }', 'T1 resolver: watchdog exclusion neutered'],
  ['M34', S, "if (!m || m.direction !== 'in') continue;", "if (!m || m.direction !== 'out') continue;", 'T1 resolver: inbound/outbound flipped'],
  ['M35', S, 'classified: inbound - automated - unclassified', 'classified: 0', 'T1 coverage: classified tally zeroed'],
  ['M36', S, "const blind = classedRows === 0 ? 'no row carried lesson_class or signal_type'", "const blind = false ? 'no row carried lesson_class or signal_type'", 'T2 blindness branch A (classedRows) removed'],
  ['M37', S, "    : fixStamped === 0 ? 'no row carried fix_shipped_at — after-fix recurrence is unanswerable'", "    : false ? 'no row carried fix_shipped_at — after-fix recurrence is unanswerable'", 'T2 blindness branch B (fixStamped) removed'],
  ['M38', S, 'return { classes: blind ? null : [...byClass.values()], queried, blind, scanned: rows.length, classedRows };', 'return { classes: [...byClass.values()], queried, blind, scanned: rows.length, classedRows };', 'T2 FALSE ALL-CLEAR restored (always array)'],
  ['M39', S, 'payload: r.row_data?.payload ?? r.row_data,', 'payload: r.row_data,', 'T2 archive payload un-nesting removed'],
  ['M40', S, "  const archived = await supabase.from('retention_archive')", '  const archived = { data: [], error: null }; const _unused = await supabase.from(\'retention_archive_DISABLED\')', 'T2 UNION broken (archive not read)'],
  ['M41', S, 'if (fixedAt && (!entry.fixedAt || fixedAt < entry.fixedAt)) entry.fixedAt = fixedAt;', 'if (fixedAt && (!entry.fixedAt || fixedAt > entry.fixedAt)) entry.fixedAt = fixedAt;', 'T2 earliest-fix -> latest-fix'],
  ['M42', S, '        .map((p) => p.pattern_id),\n    );', '        .map((p, _i) => p.pattern_id + String(_i)),\n    );', 'T3 DISTINCT counting defeated (row counting)'],
  ['M43', S, '      reachedPatterns: reached.size,', '      reachedPatterns: Math.min(reached.size, namedKeys.size),', 'T3 Math.min CLAMP re-added (span guard dead again)'],
  ['M44', S, 'return { readings: blind ? null : readings, blind };', 'return { readings, blind };', 'T3 FALSE ALL-CLEAR restored (always array)'],
  ['M45', S, 'if (namedKeys.size === 0) continue;', 'if (namedKeys.size === -1) continue;', 'T3 empty-denominator window admitted'],
  ['M46', S, 'export const MAX_CANDIDATES_PER_CLASS = 10;', 'export const MAX_CANDIDATES_PER_CLASS = 100000;', 'candidate cap removed'],
  ['M47', S, 'return { written, truncated: truncated.length ? truncated : null };', 'return { written, truncated: null };', 'truncation record silenced'],
  ['M48', S, "const dedupKey = `${v.trigger}::${ev?.questionClass || ev?.classKey || 'series'}::${runAt.slice(0, 10)}::${i}`;", 'const dedupKey = `${v.trigger}::${runAt.slice(0, 10)}`;', 'dedup_key collapses same-day findings'],
  ['M49', S, 'classes: t2.classes ?? undefined,', 'classes: t2.classes ?? [],', 'runSweep: T2 null->[] FALSE ALL-CLEAR at call site'],
  ['M50', S, 'readings: t3.readings ?? undefined,', 'readings: t3.readings ?? [],', 'runSweep: T3 null->[] FALSE ALL-CLEAR at call site'],
  ['M51', S, 'export const SMS_WINDOW_HOURS = 168;', 'export const SMS_WINDOW_HOURS = 1;', 'T1 window 168h->1h'],
  ['M52', S, 'export const EXPLORATION_TOP_N = 5;', 'export const EXPLORATION_TOP_N = 0;', 'exploration floor emptied'],
  ['M53', S, 'export const LESSON_WINDOW_DAYS = 120;', 'export const LESSON_WINDOW_DAYS = 1;', 'T2 lesson window 120d->1d'],
];

function restore() { execSync(`git checkout -- ${P} ${L} ${S}`, { stdio: 'ignore' }); }

const results = [];
restore();
for (const [id, file, find, replace, note] of MUTANTS) {
  const src = readFileSync(file, 'utf8');
  const occurrences = src.split(find).length - 1;
  // A mutation that never applied produces a GREEN suite and reads exactly like a survivor.
  // Assert it applied exactly once before believing any verdict from it.
  if (occurrences !== 1) {
    results.push({ id, note, file, status: 'NOT_APPLIED', detail: `search string found ${occurrences}x (need exactly 1)` });
    console.log(`${id.padEnd(5)} NOT_APPLIED (${occurrences}x)  ${note}`);
    continue;
  }
  writeFileSync(file, src.replace(find, replace));
  let status; let detail = '';
  try {
    execSync('npx vitest run tests/unit/solomon/ --silent', { stdio: 'pipe', timeout: 180000 });
    status = 'SURVIVED';
  } catch (e) {
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    status = 'KILLED';
    const m = out.match(/Tests\s+(\d+) failed/);
    detail = m ? `${m[1]} test(s) failed` : 'suite errored';
  }
  restore();
  results.push({ id, note, file, status, detail });
  console.log(`${id.padEnd(5)} ${status.padEnd(11)} ${note}${detail ? '  [' + detail + ']' : ''}`);
}
restore();

const survived = results.filter((r) => r.status === 'SURVIVED');
const notApplied = results.filter((r) => r.status === 'NOT_APPLIED');
console.log(`\n===== SUMMARY =====`);
console.log(`total mutants attempted: ${results.length}`);
console.log(`KILLED:      ${results.filter((r) => r.status === 'KILLED').length}`);
console.log(`SURVIVED:    ${survived.length}`);
console.log(`NOT_APPLIED: ${notApplied.length}`);
console.log(`\nSURVIVING MUTANTS:`);
survived.forEach((r) => console.log(`  ${r.id.padEnd(5)} ${r.file}  ${r.note}`));
if (notApplied.length) {
  console.log(`\nNOT APPLIED (search string needs fixing):`);
  notApplied.forEach((r) => console.log(`  ${r.id.padEnd(5)} ${r.note} — ${r.detail}`));
}
writeFileSync('.artifacts/qa-recheck/mutation-results.json', JSON.stringify(results, null, 2));
