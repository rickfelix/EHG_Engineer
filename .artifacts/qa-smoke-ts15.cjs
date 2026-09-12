// TS-15 smoke: run the real feeder scripts with --json at a time outside every ET window,
// with the michael_* migration unapplied. No --apply anywhere: every script stays in its
// default read-only/dry-run path. Runner-produced; writes its own results file.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS = [
  'scripts/michael/calendar-read.mjs',
  'scripts/michael/gmail-triage.mjs',
  'scripts/michael/tasks-classifier.mjs',
  'scripts/michael/todoist-brief.mjs',
  'scripts/michael/queue-read.mjs',
  'scripts/michael/retention.mjs',
];

const results = [];
for (const s of SCRIPTS) {
  const r = spawnSync(process.execPath, [s, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
  const stdout = (r.stdout || '').trim();
  let parsed = null, parseError = null, singleObject = false;
  try {
    parsed = JSON.parse(stdout);
    singleObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch (e) {
    parseError = e.message;
  }
  results.push({
    script: s,
    exitCode: r.status,
    signal: r.signal,
    stdoutBytes: stdout.length,
    stdoutIsSingleJsonObject: singleObject,
    parseError,
    parsed,
    stderrTail: (r.stderr || '').split('\n').slice(-6).join('\n'),
  });
  console.log('--- ' + s + ' exit=' + r.status + ' singleJsonObject=' + singleObject);
  console.log('    stdout: ' + (stdout.length > 500 ? stdout.slice(0, 500) + '...[trunc]' : stdout));
  if (parseError) console.log('    PARSE ERROR: ' + parseError);
  if ((r.stderr || '').trim()) console.log('    stderr tail: ' + (r.stderr || '').trim().split('\n').slice(-3).join(' | '));
}

const out = {
  scenario: 'TS-15',
  producer: 'qa-smoke-ts15.cjs',
  ranAt: new Date().toISOString(),
  cwd: process.cwd(),
  node: process.version,
  results,
};
const dest = path.join('.artifacts', 'qa-results', 'ts15-smoke.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log('\nwrote ' + dest);

const inertReasons = ['outside_et_window', 'tables_absent'];
const verdict = results.map((r) => {
  const reason = r.parsed && (r.parsed.reason || (r.parsed.counts && r.parsed.counts.reason));
  const action = r.parsed && r.parsed.action;
  return {
    script: r.script,
    exit0: r.exitCode === 0,
    singleJson: r.stdoutIsSingleJsonObject,
    action,
    reason,
    reasonInert: inertReasons.includes(reason),
  };
});
console.log('\nTS-15 per-script verdict:');
for (const v of verdict) console.log('  ' + JSON.stringify(v));
