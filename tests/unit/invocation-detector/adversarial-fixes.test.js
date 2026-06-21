/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-A — regression guards for the adversarial-review
 * findings. A wire-check SSOT's worst failure is FALSE-POSITIVE invocation, so these pin the
 * fixes for HIGH-1 (trigger-scoped schedule), HIGH-2 (commented schedule), MEDIUM-3 (flag_gate),
 * MEDIUM-4 (execSync single-string), MEDIUM-5 (same-basename precedence).
 */
import { describe, it, expect } from 'vitest';
import {
  TRIGGER_TYPES,
  matchGhaWorkflowRef,
  matchParentShellRef,
  stripYamlComments,
  extractOnTriggers,
  detectSchedule,
} from '../../../lib/invocation-detector/index.js';

describe('HIGH-2: commented-out schedule/cron must NOT read as scheduled', () => {
  const wf = {
    file: '.github/workflows/dormant.yml',
    content: [
      'on:',
      '  workflow_dispatch:',
      '  # schedule:',
      "  #   - cron: '0 0 * * *'",
      'jobs:',
      '  j:',
      '    steps:',
      '      - run: node scripts/x.cjs',
    ].join('\n'),
  };
  it('strips full-line comments so a dormant workflow is not invoked', () => {
    const t = matchGhaWorkflowRef('scripts/x.cjs', wf);
    expect(t.evidence.scheduled).toBe(false);
    expect(t.evidence.cron).toBeNull();
  });
  it('stripYamlComments preserves a # inside a quoted value', () => {
    expect(stripYamlComments("cron: '0 0 * * #'  # note")).toBe("cron: '0 0 * * #'  ");
  });
});

describe('HIGH-1: schedule must be scoped to the on: block / not reach event-guarded steps', () => {
  it('a `schedule`-named job key elsewhere does not count as a trigger', () => {
    const wf = {
      file: '.github/workflows/x.yml',
      content: 'on:\n  push:\njobs:\n  schedule:\n    steps:\n      - run: node scripts/x.cjs --cron\n',
    };
    expect(detectSchedule(wf.content).scheduled).toBe(false);
    expect(matchGhaWorkflowRef('scripts/x.cjs', wf).evidence.scheduled).toBe(false);
  });
  it('an explicit event-guard excluding schedule demotes scheduled→false with a warning', () => {
    const wf = {
      file: '.github/workflows/x.yml',
      content: [
        'on:',
        '  push:',
        '  schedule:',
        "    - cron: '0 0 * * *'",
        'jobs:',
        '  j:',
        '    steps:',
        "      - if: github.event_name == 'push'",
        '        run: node scripts/only-on-push.cjs',
      ].join('\n'),
    };
    const t = matchGhaWorkflowRef('scripts/only-on-push.cjs', wf);
    expect(t.evidence.scheduled).toBe(false);
    expect(t.evidence.warnings.some((w) => /event-guarded/.test(w))).toBe(true);
  });
  it('a genuinely scheduled, UN-guarded step stays scheduled=true', () => {
    const wf = {
      file: '.github/workflows/x.yml',
      content: "on:\n  push:\n  schedule:\n    - cron: '0 0 * * *'\njobs:\n  j:\n    steps:\n      - run: node scripts/both.cjs\n",
    };
    expect(matchGhaWorkflowRef('scripts/both.cjs', wf).evidence.scheduled).toBe(true);
  });
});

describe('MEDIUM-3: flag_gate must be a real ENV/UPPER_SNAKE token, not a lowercase word', () => {
  it('does not match lowercase words like "please"/"enable"', () => {
    const wf = {
      file: '.github/workflows/x.yml',
      content: "on:\n  schedule:\n    - cron: '0 0 * * *'\njobs:\n  j:\n    steps:\n      - run: node scripts/x.cjs && echo please enable true\n",
    };
    expect(matchGhaWorkflowRef('scripts/x.cjs', wf).evidence.flag_gate).toBeNull();
  });
  it('extracts a real vars.X flag reference', () => {
    const wf = {
      file: '.github/workflows/x.yml',
      content: "on:\n  schedule:\n    - cron: '0 0 * * *'\njobs:\n  j:\n    if: vars.SWEEP_ENABLE == 'true'\n    steps:\n      - run: node scripts/x.cjs\n",
    };
    expect(matchGhaWorkflowRef('scripts/x.cjs', wf).evidence.flag_gate).toBe('SWEEP_ENABLE');
  });
});

describe('MEDIUM-4: matchParentShellRef matches the execSync single-string form', () => {
  it("execSync('node scripts/child.cjs') is detected", () => {
    const parent = { file: 'scripts/runner.cjs', content: "execSync('node scripts/child.cjs --x', {});" };
    const t = matchParentShellRef('scripts/child.cjs', parent);
    expect(t).toMatchObject({ type: TRIGGER_TYPES.PARENT_SCRIPT_SHELL, evidence: { invocation_call: 'execSync' } });
  });
});

describe('MEDIUM-5: a same-basename ref preceding the real one does not mask it', () => {
  it('finds scripts/b/sweep.cjs even when scripts/a/sweep.cjs appears first in the window', () => {
    const parent = { file: 'scripts/p.cjs', content: "spawnSync('node', ['scripts/a/sweep.cjs']); spawnSync('node', ['scripts/b/sweep.cjs']);" };
    const t = matchParentShellRef('scripts/b/sweep.cjs', parent);
    expect(t).not.toBeNull();
    expect(t.evidence.child_script).toBe('scripts/b/sweep.cjs');
  });
});

describe('helper: extractOnTriggers', () => {
  it('returns inline and block trigger forms', () => {
    expect(extractOnTriggers('on: [push, schedule]\njobs:\n').trim()).toBe('[push, schedule]');
    expect(extractOnTriggers('on:\n  schedule:\n    - cron: "x"\njobs:\n')).toContain('schedule:');
  });
});
