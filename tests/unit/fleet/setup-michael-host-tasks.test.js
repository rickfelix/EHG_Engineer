// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-8, TS-13 — the host registrar for the credentialed feeders.
// Pure argv/content assertions plus main() driven through injected deps: no schtasks invocation, no host mutation.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MICHAEL_TASKS, INTERVAL_MINUTES, START_TIME, assertTaskName, commandFor, buildPlan, parseArgs, main, wrapperPromoted, scriptFileOf, wrapperPathFromXml, verifyBatteryTolerant } from '../../../scripts/setup-michael-host-tasks.mjs';
import { TASK_NAME_ILLEGAL_CHARS } from '../../../scripts/setup-alarm-cron-tasks.mjs';
import { FEEDERS } from '../../../lib/michael/feeder.mjs';

const REAL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const REPO = 'C:\\repo with space';

/** exists: boolean for every path, or a predicate(path). files: path -> content for readFileSync (the wrappers on disk). */
function deps({ platform = 'win32', schtasks = () => ({ ok: true, stdout: '' }), exists = true, files = {}, renameFails = false, battery = () => ({ ok: true }) } = {}) {
  const logs = [], errors = [], warns = [], calls = [], writes = [], renames = [], unlinks = [], batteryCalls = [];
  const has = (p) => (typeof exists === 'function' ? exists(p) : exists);
  return {
    d: {
      platform, repoRoot: REPO,
      logger: { log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)), warn: (m) => { warns.push(String(m)); errors.push(String(m)); } },
      runSchtasks: (args) => { calls.push(args); return schtasks(args); },
      applyBatterySettings: (name) => { batteryCalls.push(name); return battery(name); },
      fs: {
        existsSync: (p) => has(p), mkdirSync: () => {},
        writeFileSync: (p, c) => writes.push([p, c]),
        renameSync: (from, to) => { renames.push([from, to]); if (renameFails) throw new Error('EPERM'); },
        unlinkSync: (p) => unlinks.push(p),
        readFileSync: (p) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; },
      },
    },
    logs, errors, warns, calls, writes, renames, unlinks, batteryCalls,
  };
}
const GMAIL_WRAPPER = path.join(REPO, 'scripts', 'cron', 'michael-gmail-triage-task.cmd');
const BATTERY_FALSE = '<Settings><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries></Settings>';

describe('MICHAEL_TASKS and the plan', () => {
  it('registers exactly the seven host-venue feeders with distinct colon-free names and michael-<feeder>-task.cmd wrappers (gitignored pattern)', () => {
    expect(MICHAEL_TASKS.map((t) => t.feeder)).toEqual(['tasks-classifier', 'calendar-read', 'gmail-triage', 'todoist-brief', 'brief-assemble', 'oracle-extract', 'health-sync']);
    expect(new Set(MICHAEL_TASKS.map((t) => t.taskName)).size).toBe(7);
    for (const t of MICHAEL_TASKS) {
      for (const ch of TASK_NAME_ILLEGAL_CHARS) expect(t.taskName, `${t.taskName} contains ${JSON.stringify(ch)}`).not.toContain(ch);
      expect(t.taskName).toMatch(/^EHG Michael [a-z-]+$/);
      expect(t.wrapperRelPath).toMatch(/^scripts[\\/]cron[\\/]michael-[a-z-]+-task\.cmd$/);
    }
    expect(INTERVAL_MINUTES).toBe(15); expect(START_TIME).toBe('00:00');
  });
  it('todoist-brief and brief-assemble are on the host (ratification 00f696f1) and every windowEt mirrors FEEDERS (single window or QF-20260911-282 multi-window); every feeder script exists in this repo (QF-20260911-145)', () => {
    for (const t of MICHAEL_TASKS) {
      const f = FEEDERS[t.feeder];
      expect(f, `${t.feeder} is not in FEEDERS`).toBeTruthy();
      const windows = Array.isArray(f.window) ? f.window : [f.window];
      expect(t.windowEt).toBe(windows.map((w) => `${w.start}-${w.end}`).join(', '));
      expect(f.intervalMinutes).toBe(INTERVAL_MINUTES);
      expect(t.script).toMatch(/ --apply$/);
      expect(fs.existsSync(scriptFileOf(t, REAL_REPO)), `${t.script} missing from the repo`).toBe(true);
    }
    // QF-20260911-282: three read feeders now carry the ratified midday/evening windows too.
    expect(MICHAEL_TASKS.find((t) => t.feeder === 'calendar-read')).toMatchObject({ taskName: 'EHG Michael calendar-read', windowEt: '04:00-05:00, 12:00-12:30, 18:00-18:30' });
    expect(MICHAEL_TASKS.find((t) => t.feeder === 'gmail-triage')).toMatchObject({ taskName: 'EHG Michael gmail-triage', windowEt: '04:30-05:30, 12:00-12:30, 18:00-18:30' });
    expect(MICHAEL_TASKS.find((t) => t.feeder === 'todoist-brief')).toMatchObject({ taskName: 'EHG Michael todoist-brief', windowEt: '04:45-05:30, 12:00-12:30, 18:00-18:30' });
    expect(MICHAEL_TASKS.find((t) => t.feeder === 'brief-assemble')).toMatchObject({ taskName: 'EHG Michael brief-assemble', windowEt: '05:15-06:00' });
    expect(MICHAEL_TASKS.filter((t) => t.promotable).map((t) => t.feeder)).toEqual(['gmail-triage']);
    // QF-20260911-282 / ratification 04c9dd29 point 2: tasks-classifier registers DISABLED, and only it.
    expect(MICHAEL_TASKS.filter((t) => t.disabled).map((t) => t.feeder)).toEqual(['tasks-classifier']);
  });
  it('the create args carry /SC MINUTE /MO 15 /ST 00:00 /F and NEITHER /RU NOR /NP (measured denied unelevated); the TR action is the quoted hidden launcher', () => {
    const plan = buildPlan({ repoRoot: REPO });
    expect(plan).toHaveLength(7);
    for (const p of plan) {
      expect(p.createArgs).toEqual(['/Create', '/TN', p.taskName, '/TR', p.trAction, '/SC', 'MINUTE', '/MO', '15', '/ST', '00:00', '/F']);
      expect(p.createArgs).not.toContain('/RU'); expect(p.createArgs).not.toContain('/NP');
      expect(p.trAction).toBe(`wscript.exe //B "${path.join(REPO, 'scripts', 'cron', 'run-hidden.vbs')}" "${p.wrapperPath}"`);
      expect(p.wrapperContent).toContain(`cd /d "${REPO}"`);
      expect(p.wrapperContent).toContain(`call node ${p.script}`);
      expect(p.wrapperContent).not.toMatch(/MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT|TODOIST_API_TOKEN|set /);
    }
  });
  it('gmail-triage is registered with --apply and WITHOUT --modify by default; --with-modify adds it to that task only', () => {
    const shadow = buildPlan({ repoRoot: REPO });
    const gmail = shadow.find((p) => p.feeder === 'gmail-triage');
    expect(gmail.script).toBe('scripts/michael/gmail-triage.mjs --apply');
    expect(shadow.every((p) => !/--modify/.test(p.script) && !/--modify/.test(p.wrapperContent))).toBe(true);
    for (const p of shadow) expect(p.script).toMatch(/ --apply$/);
    const promoted = buildPlan({ repoRoot: REPO, withModify: true });
    expect(promoted.find((p) => p.feeder === 'gmail-triage').script).toBe('scripts/michael/gmail-triage.mjs --apply --modify');
    expect(promoted.filter((p) => /--modify/.test(p.script))).toHaveLength(1);
    expect(commandFor(MICHAEL_TASKS[0], { withModify: true })).toBe(MICHAEL_TASKS[0].script);
  });
  it('a task name with a Task-Scheduler-illegal character throws inside the build path, before any schtasks call (QF-20260906-961)', () => {
    expect(() => assertTaskName('EHG Michael: gmail')).toThrow(/illegal ":"/);
    expect(() => assertTaskName('EHG Michael gmail')).not.toThrow();
    expect(() => buildPlan({})).toThrow(/repoRoot required/);
  });
  it('parseArgs recognises every mode and flag and collects unknown tokens; main refuses them with exit 2 before anything else', async () => {
    expect(parseArgs(['node', 'x'])).toEqual({ mode: 'register', dryRun: false, withModify: false, help: false, unknown: [] });
    expect(parseArgs(['node', 'x', '--dryrun', '--with-modify']).unknown).toEqual(['--dryrun']);
    const { d, calls, writes, errors } = deps();
    expect(await main(['node', 'x', '--dryrun', '--with-modify'], d)).toEqual({ exitCode: 2, action: 'unknown_flag', unknown: ['--dryrun'] });
    expect(calls).toEqual([]); expect(writes).toEqual([]); expect(errors[0]).toMatch(/unknown argument/);
    expect(parseArgs(['node', 'x', '--with-modify', '--dry-run'])).toMatchObject({ mode: 'register', dryRun: true, withModify: true });
    expect(parseArgs(['node', 'x', '--remove'])).toMatchObject({ mode: 'remove' });
    expect(parseArgs(['node', 'x', '--status'])).toMatchObject({ mode: 'status' });
    expect(parseArgs(['node', 'x', '--verify'])).toMatchObject({ mode: 'verify' });
  });
});

describe('main (injected deps, no host mutation)', () => {
  it('refuses on non-win32 with exit 2 before touching the OS', async () => {
    const { d, calls, errors } = deps({ platform: 'linux' });
    expect(await main(['node', 'x'], d)).toEqual({ exitCode: 2, action: 'not_win32' });
    expect(calls).toEqual([]); expect(errors[0]).toMatch(/win32-only/);
  });
  it('--dry-run prints seven wrappers, seven /Create lines and seven Set-ScheduledTask lines with no /RU /NP, states the preconditions, and mutates nothing', async () => {
    const { d, calls, writes, logs, batteryCalls } = deps();
    const r = await main(['node', 'x', '--dry-run'], d);
    expect(r).toMatchObject({ exitCode: 0, action: 'dry_run_register' });
    expect(r.plan.map((p) => p.script)).toEqual(['scripts/michael/tasks-classifier.mjs --apply', 'scripts/michael/calendar-read.mjs --apply', 'scripts/michael/gmail-triage.mjs --apply', 'scripts/michael/todoist-brief.mjs --apply', 'scripts/michael/brief-assemble.mjs --apply', 'scripts/michael/oracle-extract.mjs --apply', 'scripts/michael/health-sync.mjs --apply']);
    expect(logs.filter((l) => /would run: schtasks \/Create/.test(l))).toHaveLength(7);
    expect(logs.filter((l) => /would run: Set-ScheduledTask -TaskName 'EHG Michael [a-z-]+' -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries$/.test(l))).toHaveLength(7);
    expect(logs.join('\n')).toMatch(/awake/); expect(logs.join('\n')).toMatch(/battery-tolerant/); expect(logs.join('\n')).not.toMatch(/mains power/); expect(logs.join('\n')).toMatch(/no \/RU \/NP/);
    for (const l of logs.filter((x) => /would run: schtasks/.test(x))) expect(l).not.toMatch(/\/RU |\/NP /);
    expect(calls).toEqual([]); expect(writes).toEqual([]); expect(batteryCalls).toEqual([]);
    // dry-run previews the read-only preflight: a missing feeder and a pending demotion are shown, nothing mutated
    const classifier = path.join(REPO, 'scripts', 'michael', 'tasks-classifier.mjs');
    const pre = deps({ exists: (p) => p !== classifier, files: { [GMAIL_WRAPPER]: 'call node scripts/michael/gmail-triage.mjs --apply --modify\r\n' } });
    expect(await main(['node', 'x', '--dry-run'], pre.d)).toMatchObject({ exitCode: 0, action: 'dry_run_register' });
    expect(pre.errors.join('\n')).toMatch(/would REFUSE: feeder script\(s\) missing/); expect(pre.warns.join('\n')).toMatch(/would DEMOTE/);
    expect(pre.calls).toEqual([]); expect(pre.writes).toEqual([]);
  });
  it('register writes the seven wrappers, runs seven /Create calls and clears the battery restrictions on each registered task; --with-modify promotes only gmail-triage', async () => {
    const { d, calls, writes, batteryCalls, warns, logs } = deps();
    expect(await main(['node', 'x'], d)).toMatchObject({ exitCode: 0, action: 'registered', withModify: false });
    expect(writes.map(([p]) => path.basename(p))).toEqual(['michael-tasks-classifier-task.cmd.new', 'michael-calendar-read-task.cmd.new', 'michael-gmail-triage-task.cmd.new', 'michael-todoist-brief-task.cmd.new', 'michael-brief-assemble-task.cmd.new', 'michael-oracle-extract-task.cmd.new', 'michael-health-sync-task.cmd.new']);
    // 7 /Create + 1 /Change /DISABLE (tasks-classifier only, QF-20260911-282 / ratification 04c9dd29 point 2)
    expect(calls).toHaveLength(8);
    const createCalls = calls.filter((c) => c[0] === '/Create');
    expect(createCalls).toHaveLength(7);
    expect(calls.filter((c) => c[0] === '/Change')).toEqual([['/Change', '/TN', 'EHG Michael tasks-classifier', '/DISABLE']]);
    expect(batteryCalls).toEqual(MICHAEL_TASKS.map((t) => t.taskName)); expect(warns).toEqual([]);
    for (const c of createCalls) { expect(c).not.toContain('/RU'); expect(c).not.toContain('/NP'); }
    expect(writes.every(([, c]) => !/--modify/.test(c))).toBe(true);
    const p = deps();
    expect(await main(['node', 'x', '--with-modify'], p.d)).toMatchObject({ exitCode: 0, action: 'registered', withModify: true });
    expect(p.writes.filter(([, c]) => /--modify/.test(c)).map(([f]) => path.basename(f))).toEqual(['michael-gmail-triage-task.cmd.new']);
    expect(p.renames.map(([, to]) => path.basename(to))).toContain('michael-gmail-triage-task.cmd');
    // FR-5 (QF-20260911-282): the chairman's exact re-registration keystroke is printed at the end of a live run.
    expect(logs.some((l) => l.includes('node scripts/setup-michael-host-tasks.mjs && node scripts/setup-michael-host-tasks.mjs --verify'))).toBe(true);
  });
  it('QF-20260911-282: tasks-classifier is disabled on every register pass (idempotent), non-fatally warned if the /Change /DISABLE call fails', async () => {
    const ok = deps();
    expect(await main(['node', 'x'], ok.d)).toMatchObject({ exitCode: 0, action: 'registered' });
    expect(ok.warns).toEqual([]);
    expect(ok.logs.some((l) => /tasks-classifier.*DISABLED/.test(l))).toBe(true);
    const failDisable = deps({ schtasks: (args) => (args[0] === '/Change' ? { ok: false, code: 1, stderr: 'ERROR: Access is denied.' } : { ok: true, stdout: 'SUCCESS' }) });
    expect(await main(['node', 'x'], failDisable.d)).toMatchObject({ exitCode: 0, action: 'registered' }); // non-fatal
    expect(failDisable.warns).toHaveLength(1);
    expect(failDisable.warns[0]).toMatch(/could not disable 'EHG Michael tasks-classifier'.*Access is denied/);
    // the wrapper still swaps in and the task is still created even if the disable step fails
    expect(failDisable.renames.map(([, to]) => path.basename(to))).toContain('michael-tasks-classifier-task.cmd');
  });
  it('refuses to register when run-hidden.vbs is missing; a failed /Create yields exit 1', async () => {
    const { d, calls } = deps({ exists: false });
    expect(await main(['node', 'x'], d)).toEqual({ exitCode: 1, action: 'launcher_missing' });
    expect(calls).toEqual([]);
    // a feeder script that has not landed yet: refuse before writing a wrapper or touching schtasks
    const classifier = path.join(REPO, 'scripts', 'michael', 'tasks-classifier.mjs');
    expect(scriptFileOf(buildPlan({ repoRoot: REPO })[0], REPO)).toBe(classifier);
    const m = deps({ exists: (p) => p !== classifier });
    expect(await main(['node', 'x'], m.d)).toEqual({ exitCode: 1, action: 'feeder_script_missing', missing: [classifier] });
    expect(m.calls).toEqual([]); expect(m.writes).toEqual([]);
    // a plain re-run over a promoted wrapper is announced as a demotion
    const promoted = deps({ files: { [GMAIL_WRAPPER]: `cd /d "${REPO}"\r\ncall node scripts/michael/gmail-triage.mjs --apply --modify\r\n` } });
    expect(await main(['node', 'x'], promoted.d)).toMatchObject({ exitCode: 0, action: 'registered', withModify: false });
    expect(promoted.warns.join('\n')).toMatch(/DEMOTES/);
    const plain = deps({ files: { [GMAIL_WRAPPER]: 'call node scripts/michael/gmail-triage.mjs --apply\r\n' } });
    expect(await main(['node', 'x'], plain.d)).toMatchObject({ exitCode: 0, action: 'registered' });
    expect(plain.warns).toEqual([]);
    const f = deps({ schtasks: (args) => (args[2] === 'EHG Michael calendar-read' ? { ok: false, code: 1, stderr: 'ERROR: Access is denied.' } : { ok: true, stdout: 'SUCCESS' }) });
    expect(await main(['node', 'x'], f.d)).toMatchObject({ exitCode: 1, action: 'registered' });
    expect(f.errors.join('\n')).toMatch(/Access is denied/);
    // the wrapper is swapped in only after /Create succeeds: the failed task's staged wrapper is removed, its old wrapper untouched
    expect(f.renames.map(([, to]) => path.basename(to))).toEqual(['michael-tasks-classifier-task.cmd', 'michael-gmail-triage-task.cmd', 'michael-todoist-brief-task.cmd', 'michael-brief-assemble-task.cmd', 'michael-oracle-extract-task.cmd', 'michael-health-sync-task.cmd']);
    // the battery post-step runs only on a task that /Create actually registered
    expect(f.batteryCalls).toEqual(MICHAEL_TASKS.filter((t) => t.feeder !== 'calendar-read').map((t) => t.taskName));
    expect(f.unlinks.map((p) => path.basename(p))).toEqual(['michael-calendar-read-task.cmd.new']);
    expect(f.errors.join('\n')).toMatch(/left unchanged/);
    // a promotion whose /Create is refused never reaches the live wrapper
    const denied = deps({ schtasks: (args) => (args[2] === 'EHG Michael gmail-triage' ? { ok: false, code: 1, stderr: 'ERROR: Access is denied.' } : { ok: true, stdout: 'SUCCESS' }) });
    expect(await main(['node', 'x', '--with-modify'], denied.d)).toMatchObject({ exitCode: 1 });
    expect(denied.renames.some(([, to]) => /gmail/.test(to))).toBe(false);
    expect(denied.unlinks).toEqual([path.join(REPO, 'scripts', 'cron', 'michael-gmail-triage-task.cmd.new')]);
    const swap = deps({ renameFails: true });
    expect(await main(['node', 'x'], swap.d)).toMatchObject({ exitCode: 1 });
    expect(swap.errors.join('\n')).toMatch(/runs the PREVIOUS wrapper/);
    // the staged file never lingers (it embeds the host-absolute repo root): removed on a failed rename too
    expect(swap.unlinks.map((p) => path.basename(p))).toEqual(['michael-tasks-classifier-task.cmd.new', 'michael-calendar-read-task.cmd.new', 'michael-gmail-triage-task.cmd.new', 'michael-todoist-brief-task.cmd.new', 'michael-brief-assemble-task.cmd.new', 'michael-oracle-extract-task.cmd.new', 'michael-health-sync-task.cmd.new']);
    // a refused Set-ScheduledTask is non-fatal (the task exists; QF-20260908-848 shape) but is said out loud, per task, with the failure code
    const b = deps({ battery: (name) => (/health-sync/.test(name) ? { ok: false, error: 'Access is denied' } : { ok: true }) });
    expect(await main(['node', 'x'], b.d)).toMatchObject({ exitCode: 0, action: 'registered' });
    expect(b.batteryCalls).toHaveLength(7);
    expect(b.warns).toHaveLength(1); expect(b.warns[0]).toMatch(/battery restrictions for 'EHG Michael health-sync'.*Access is denied.*0x800710E0/);
  });
  it('--status queries each task; --remove deletes each; --verify reads the split <Command>/<Arguments> XML and reports the shadow phase', async () => {
    const s = deps({ schtasks: () => ({ ok: true, stdout: 'TaskName: x' }) });
    expect(await main(['node', 'x', '--status'], s.d)).toEqual({ exitCode: 0, action: 'status' });
    expect(s.calls.map((c) => c[0])).toEqual(Array(7).fill('/Query'));
    const rm = deps();
    expect(await main(['node', 'x', '--remove'], rm.d)).toEqual({ exitCode: 0, action: 'removed' });
    expect(rm.calls.map((c) => c.slice(0, 3))).toEqual(MICHAEL_TASKS.map((t) => ['/Delete', '/TN', t.taskName]));
    const wrapperOf = (name) => path.join(REPO, 'scripts', 'cron', `michael-${name}-task.cmd`);
    // QF-20260911-282: `enabled: false` injects <Enabled>false</Enabled> (tasks-classifier is registered DISABLED on purpose).
    const xmlFor = (wrapper, { enabled = true } = {}) => `<Task><Actions><Exec><Command>wscript.exe</Command><Arguments>//B "${path.join(REPO, 'scripts', 'cron', 'run-hidden.vbs')}" "${wrapper}"</Arguments></Exec></Actions><Triggers><TimeTrigger><Repetition><Interval>PT15M</Interval></Repetition></TimeTrigger></Triggers><Settings>${enabled ? '' : '<Enabled>false</Enabled>'}<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries></Settings></Task>`;
    // each query answers with the XML of the task asked about, naming that task's own wrapper; tasks-classifier's is DISABLED
    const perTask = (args) => {
      const feeder = MICHAEL_TASKS.find((t) => t.taskName === args[2]).feeder;
      return { ok: true, stdout: xmlFor(wrapperOf(feeder), { enabled: feeder !== 'tasks-classifier' }) };
    };
    expect(wrapperPathFromXml(xmlFor('C:\\x\\w.cmd'))).toBe('C:\\x\\w.cmd');
    expect(wrapperPathFromXml('<Task></Task>')).toBe(null);
    const v = deps({ schtasks: perTask });
    const r = await main(['node', 'x', '--verify'], v.d);
    expect(r).toMatchObject({ exitCode: 0, action: 'verified' });
    expect(r.results.map((x) => x.ok)).toEqual(Array(7).fill(true));
    for (const l of v.logs.filter((x) => /VERIFIED/.test(x))) expect(l).toMatch(/battery-tolerant/);
    expect(r.results.map((x) => x.wrapper)).toEqual(MICHAEL_TASKS.map((t) => wrapperOf(t.feeder)));
    expect(v.logs.find((l) => /gmail-triage/.test(l))).toMatch(/shadow phase/);
    // the promotion lives in the wrapper .cmd the OS launches (the XML never carries --modify): --verify reads THAT file
    const p = deps({ schtasks: perTask, files: { [GMAIL_WRAPPER]: 'call node scripts/michael/gmail-triage.mjs --apply --modify\r\n' } });
    const pr = await main(['node', 'x', '--verify'], p.d);
    expect(pr.results.find((x) => /gmail/.test(x.taskName)).modify).toBe(true);
    expect(p.logs.find((l) => /gmail-triage/.test(l))).toMatch(/--modify PROMOTED/);
    expect(pr.results.filter((x) => x.modify)).toHaveLength(1);
    // a task launching another worktree's wrapper, or a wrapper that does not exist, fails verify: never 'healthy shadow phase'
    const other = deps({ schtasks: (args) => (args[2] === 'EHG Michael gmail-triage' ? { ok: true, stdout: xmlFor('C:\\other-worktree\\scripts\\cron\\michael-gmail-triage-task.cmd') } : perTask(args)) });
    const or = await main(['node', 'x', '--verify'], other.d);
    expect(or.exitCode).toBe(1); expect(or.results.find((x) => /gmail/.test(x.taskName))).toMatchObject({ ok: false, modify: false });
    expect(other.errors.join('\n')).toMatch(/launches C:\\other-worktree/);
    const gone = deps({ schtasks: perTask, exists: (f) => f !== GMAIL_WRAPPER });
    const gr = await main(['node', 'x', '--verify'], gone.d);
    expect(gr.exitCode).toBe(1); expect(gone.errors.join('\n')).toMatch(/does not exist/);
    expect(wrapperPromoted(GMAIL_WRAPPER, { existsSync: () => true, readFileSync: () => 'call node x.mjs --apply --modifying' })).toBe(false);
    const bare = deps({ schtasks: () => ({ ok: true, stdout: '<Task><Actions><Exec><Command>C:\\x\\michael-x-task.cmd</Command></Exec></Actions></Task>' }) });
    expect((await main(['node', 'x', '--verify'], bare.d)).exitCode).toBe(1);
    const missing = deps({ schtasks: () => ({ ok: false, code: 1, stderr: 'ERROR: The system cannot find the file specified.' }) });
    expect((await main(['node', 'x', '--verify'], missing.d)).exitCode).toBe(1);
    // the battery flags are read back from the XML: a task still carrying Task Scheduler's defaults (the measured 0x800710E0 state) fails verify
    expect(verifyBatteryTolerant(xmlFor('C:\\x\\w.cmd'))).toEqual([]);
    expect(verifyBatteryTolerant('<Task><Settings><DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>true</StopIfGoingOnBatteries></Settings></Task>')).toHaveLength(2);
    expect(verifyBatteryTolerant('<Task></Task>').map((p) => /^<(\w+)>/.exec(p)[1])).toEqual(['DisallowStartIfOnBatteries', 'StopIfGoingOnBatteries']);
    expect(verifyBatteryTolerant('<Task><Settings><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries></Settings></Task>')).toEqual([expect.stringMatching(/^<StopIfGoingOnBatteries> is not false/)]);
    const onBattery = deps({ schtasks: (args) => (args[2] === 'EHG Michael todoist-brief' ? { ok: true, stdout: perTask(args).stdout.replace(BATTERY_FALSE, '') } : perTask(args)) });
    const br = await main(['node', 'x', '--verify'], onBattery.d);
    expect(br.exitCode).toBe(1); expect(br.results.filter((x) => !x.ok).map((x) => x.taskName)).toEqual(['EHG Michael todoist-brief']);
    expect(onBattery.errors.filter((e) => /todoist-brief.*Batteries> is not false/.test(e))).toHaveLength(2);
    // QF-20260911-282 / ratification 04c9dd29 point 2: --verify FAILS if the OS reports tasks-classifier ENABLED
    // (the invariant is enforced, not just passively read), and the healthy case says DISABLED, never "enabled".
    const enabledClassifier = deps({ schtasks: (args) => (args[2] === 'EHG Michael tasks-classifier' ? { ok: true, stdout: xmlFor(wrapperOf('tasks-classifier'), { enabled: true }) } : perTask(args)) });
    const ec = await main(['node', 'x', '--verify'], enabledClassifier.d);
    expect(ec.exitCode).toBe(1);
    expect(ec.results.find((x) => x.taskName === 'EHG Michael tasks-classifier')).toMatchObject({ ok: false });
    expect(enabledClassifier.errors.join('\n')).toMatch(/must stay DISABLED.*but the OS reports it enabled/);
    const disabledVerify = deps({ schtasks: perTask });
    const dv = await main(['node', 'x', '--verify'], disabledVerify.d);
    expect(dv.exitCode).toBe(0);
    expect(disabledVerify.logs.find((l) => /tasks-classifier/.test(l))).toMatch(/DISABLED \(dead by construction/);
    expect(disabledVerify.logs.find((l) => /tasks-classifier/.test(l))).not.toMatch(/, enabled,/);
  });
});
