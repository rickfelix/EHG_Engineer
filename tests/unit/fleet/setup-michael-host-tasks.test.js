// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-8, TS-13 — the host registrar for the credentialed feeders.
// Pure argv/content assertions plus main() driven through injected deps: no schtasks invocation, no host mutation.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { MICHAEL_TASKS, INTERVAL_MINUTES, START_TIME, assertTaskName, commandFor, buildPlan, parseArgs, main } from '../../../scripts/setup-michael-host-tasks.mjs';
import { TASK_NAME_ILLEGAL_CHARS } from '../../../scripts/setup-alarm-cron-tasks.mjs';

const REPO = 'C:\\repo with space';

function deps({ platform = 'win32', schtasks = () => ({ ok: true, stdout: '' }), exists = true } = {}) {
  const logs = [], errors = [], calls = [], writes = [];
  return {
    d: {
      platform, repoRoot: REPO,
      logger: { log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)), warn: (m) => errors.push(String(m)) },
      runSchtasks: (args) => { calls.push(args); return schtasks(args); },
      fs: { existsSync: () => exists, mkdirSync: () => {}, writeFileSync: (p, c) => writes.push([p, c]) },
    },
    logs, errors, calls, writes,
  };
}

describe('MICHAEL_TASKS and the plan', () => {
  it('registers exactly the three credentialed feeders with distinct colon-free names and michael-<feeder>-task.cmd wrappers (gitignored pattern)', () => {
    expect(MICHAEL_TASKS.map((t) => t.feeder)).toEqual(['tasks-classifier', 'calendar-read', 'gmail-triage']);
    expect(new Set(MICHAEL_TASKS.map((t) => t.taskName)).size).toBe(3);
    for (const t of MICHAEL_TASKS) {
      for (const ch of TASK_NAME_ILLEGAL_CHARS) expect(t.taskName, `${t.taskName} contains ${JSON.stringify(ch)}`).not.toContain(ch);
      expect(t.taskName).toMatch(/^EHG Michael [a-z-]+$/);
      expect(t.wrapperRelPath).toMatch(/^scripts[\\/]cron[\\/]michael-[a-z-]+-task\.cmd$/);
    }
    expect(INTERVAL_MINUTES).toBe(15); expect(START_TIME).toBe('00:00');
  });
  it('the create args carry /SC MINUTE /MO 15 /ST 00:00 /F and NEITHER /RU NOR /NP (measured denied unelevated); the TR action is the quoted hidden launcher', () => {
    const plan = buildPlan({ repoRoot: REPO });
    expect(plan).toHaveLength(3);
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
  it('parseArgs recognises every mode and flag', () => {
    expect(parseArgs(['node', 'x'])).toEqual({ mode: 'register', dryRun: false, withModify: false, help: false });
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
  it('--dry-run prints three wrappers and three /Create lines with no /RU /NP, states the preconditions, and mutates nothing', async () => {
    const { d, calls, writes, logs } = deps();
    const r = await main(['node', 'x', '--dry-run'], d);
    expect(r).toMatchObject({ exitCode: 0, action: 'dry_run_register' });
    expect(r.plan.map((p) => p.script)).toEqual(['scripts/michael/tasks-classifier.mjs --apply', 'scripts/michael/calendar-read.mjs --apply', 'scripts/michael/gmail-triage.mjs --apply']);
    expect(logs.filter((l) => /would run: schtasks \/Create/.test(l))).toHaveLength(3);
    expect(logs.join('\n')).toMatch(/awake/); expect(logs.join('\n')).toMatch(/mains power/); expect(logs.join('\n')).toMatch(/no \/RU \/NP/);
    for (const l of logs.filter((x) => /would run: schtasks/.test(x))) expect(l).not.toMatch(/\/RU |\/NP /);
    expect(calls).toEqual([]); expect(writes).toEqual([]);
  });
  it('register writes the three wrappers and runs three /Create calls; --with-modify promotes only gmail-triage', async () => {
    const { d, calls, writes } = deps();
    expect(await main(['node', 'x'], d)).toMatchObject({ exitCode: 0, action: 'registered', withModify: false });
    expect(writes.map(([p]) => path.basename(p))).toEqual(['michael-tasks-classifier-task.cmd', 'michael-calendar-read-task.cmd', 'michael-gmail-triage-task.cmd']);
    expect(calls).toHaveLength(3);
    for (const c of calls) { expect(c[0]).toBe('/Create'); expect(c).not.toContain('/RU'); expect(c).not.toContain('/NP'); }
    expect(writes.every(([, c]) => !/--modify/.test(c))).toBe(true);
    const p = deps();
    expect(await main(['node', 'x', '--with-modify'], p.d)).toMatchObject({ exitCode: 0, action: 'registered', withModify: true });
    expect(p.writes.filter(([, c]) => /--modify/.test(c)).map(([f]) => path.basename(f))).toEqual(['michael-gmail-triage-task.cmd']);
  });
  it('refuses to register when run-hidden.vbs is missing; a failed /Create yields exit 1', async () => {
    const { d, calls } = deps({ exists: false });
    expect(await main(['node', 'x'], d)).toEqual({ exitCode: 1, action: 'launcher_missing' });
    expect(calls).toEqual([]);
    const f = deps({ schtasks: (args) => (args[2] === 'EHG Michael calendar-read' ? { ok: false, code: 1, stderr: 'ERROR: Access is denied.' } : { ok: true, stdout: 'SUCCESS' }) });
    expect(await main(['node', 'x'], f.d)).toMatchObject({ exitCode: 1, action: 'registered' });
    expect(f.errors.join('\n')).toMatch(/Access is denied/);
  });
  it('--status queries each task; --remove deletes each; --verify reads the split <Command>/<Arguments> XML and reports the shadow phase', async () => {
    const s = deps({ schtasks: () => ({ ok: true, stdout: 'TaskName: x' }) });
    expect(await main(['node', 'x', '--status'], s.d)).toEqual({ exitCode: 0, action: 'status' });
    expect(s.calls.map((c) => c[0])).toEqual(['/Query', '/Query', '/Query']);
    const rm = deps();
    expect(await main(['node', 'x', '--remove'], rm.d)).toEqual({ exitCode: 0, action: 'removed' });
    expect(rm.calls.map((c) => c.slice(0, 3))).toEqual(MICHAEL_TASKS.map((t) => ['/Delete', '/TN', t.taskName]));
    const xml = () => `<Task><Actions><Exec><Command>wscript.exe</Command><Arguments>//B "${path.join(REPO, 'scripts', 'cron', 'run-hidden.vbs')}" "${path.join(REPO, 'scripts', 'cron', 'michael-x-task.cmd')}"</Arguments></Exec></Actions><Triggers><TimeTrigger><Repetition><Interval>PT15M</Interval></Repetition></TimeTrigger></Triggers></Task>`;
    const v = deps({ schtasks: () => ({ ok: true, stdout: xml() }) });
    const r = await main(['node', 'x', '--verify'], v.d);
    expect(r).toMatchObject({ exitCode: 0, action: 'verified' });
    expect(r.results.map((x) => x.ok)).toEqual([true, true, true]);
    expect(v.logs.find((l) => /gmail-triage/.test(l))).toMatch(/shadow phase/);
    const bare = deps({ schtasks: () => ({ ok: true, stdout: '<Task><Actions><Exec><Command>C:\\x\\michael-x-task.cmd</Command></Exec></Actions></Task>' }) });
    expect((await main(['node', 'x', '--verify'], bare.d)).exitCode).toBe(1);
    const missing = deps({ schtasks: () => ({ ok: false, code: 1, stderr: 'ERROR: The system cannot find the file specified.' }) });
    expect((await main(['node', 'x', '--verify'], missing.d)).exitCode).toBe(1);
  });
});
