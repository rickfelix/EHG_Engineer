// QF-20260511-414 — structural test for .github/workflows/worktree-reaper-cadence.yml
// Asserts cron, concurrency, dispatch input, reaper invocation, state write-back,
// log artifact, and failure-issue step. Closes 4th-class witness of
// PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 by guarding the workflow against
// regression (anyone deleting cron / write-back step trips a test).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const WORKFLOW_PATH = path.join(
  process.cwd(),
  '.github',
  'workflows',
  'worktree-reaper-cadence.yml'
);

describe('QF-20260511-414: worktree-reaper-cadence.yml', () => {
  let wf;

  beforeAll(() => {
    const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    wf = yaml.load(raw);
  });

  it('exists and is parseable', () => {
    expect(wf).toBeTruthy();
    expect(wf.name).toBe('Worktree Reaper Cadence');
  });

  it('runs on daily cron + workflow_dispatch', () => {
    // js-yaml parses YAML `on:` key as boolean `true` (the "Norway problem"
    // sibling); access via bracket notation.
    const trig = wf.on ?? wf[true];
    expect(trig).toBeTruthy();
    expect(trig.schedule).toEqual([{ cron: '0 3 * * *' }]);
    expect(trig.workflow_dispatch).toBeDefined();
    expect(trig.workflow_dispatch.inputs.dry_run).toBeDefined();
  });

  it('uses concurrency group "worktree-reaper" without cancel-in-progress', () => {
    expect(wf.concurrency.group).toBe('worktree-reaper');
    expect(wf.concurrency['cancel-in-progress']).toBe(false);
  });

  it('grants issues:write for failure issue', () => {
    expect(wf.permissions.issues).toBe('write');
    expect(wf.permissions.contents).toBe('read');
  });

  it('invokes worktree:reap:execute by default, plan-only when dry_run', () => {
    const steps = wf.jobs.reap.steps;
    const runStep = steps.find((s) => s.id === 'reap');
    expect(runStep).toBeDefined();
    expect(runStep.run).toContain('npm run worktree:reap:execute');
    expect(runStep.run).toContain('npm run worktree:reap');
    expect(runStep.run).toContain('dry_run');
  });

  it('writes last_run_at to .claude/worktree-reaper-state.json', () => {
    const steps = wf.jobs.reap.steps;
    const writeStep = steps.find((s) => s.name === 'Write last_run_at to state file');
    expect(writeStep).toBeDefined();
    expect(writeStep.if).toBe('always()');
    expect(writeStep.run).toContain('.claude');
    expect(writeStep.run).toContain('worktree-reaper-state.json');
    expect(writeStep.run).toContain('last_run_at');
    expect(writeStep.run).toContain('sweep_counter');
  });

  it('opens issue only on scheduled failure', () => {
    const steps = wf.jobs.reap.steps;
    const issueStep = steps.find((s) => s.name === 'Open issue on failure');
    expect(issueStep).toBeDefined();
    expect(issueStep.if).toContain('failure()');
    expect(issueStep.if).toContain("github.event_name == 'schedule'");
    expect(issueStep.with.script).toContain('PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001');
  });

  it('uploads reaper.log + state file as artifact', () => {
    const steps = wf.jobs.reap.steps;
    const artStep = steps.find((s) => s.name === 'Upload reaper log');
    expect(artStep).toBeDefined();
    expect(artStep.if).toBe('always()');
    expect(artStep.with.path).toContain('reaper.log');
    expect(artStep.with.path).toContain('.claude/worktree-reaper-state.json');
  });
});
