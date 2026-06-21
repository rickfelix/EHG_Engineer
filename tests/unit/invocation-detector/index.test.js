/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-A (FR-1) — pure invocation-path detector.
 * Tests the PURE matchers + assembler. Core invariant: invocation != reachability.
 */
import { describe, it, expect } from 'vitest';
import {
  TRIGGER_TYPES,
  normalizeEntry,
  extractNodeEntry,
  indexNpmScripts,
  matchNpmScriptRefs,
  matchGhaWorkflowRef,
  matchHookRefs,
  matchLoopContractRef,
  matchParentShellRef,
  isExcludedEntry,
  detectInvocationPath,
} from '../../../lib/invocation-detector/index.js';

describe('normalizeEntry', () => {
  it('canonicalizes slashes, ./ prefix, and rootDir', () => {
    expect(normalizeEntry('./scripts/foo.js')).toBe('scripts/foo.js');
    expect(normalizeEntry('scripts\\foo.cjs')).toBe('scripts/foo.cjs');
    expect(normalizeEntry('C:/repo/scripts/foo.js', 'C:/repo')).toBe('scripts/foo.js');
    expect(normalizeEntry('C:\\repo\\scripts\\foo.js', 'C:\\repo')).toBe('scripts/foo.js');
    expect(normalizeEntry('')).toBe('');
  });
});

describe('extractNodeEntry', () => {
  it('pulls the entry from node commands incl. flags, ${VAR}/ and quotes', () => {
    expect(extractNodeEntry('node scripts/x.cjs --apply')).toBe('scripts/x.cjs');
    expect(extractNodeEntry('node --enable-source-maps scripts/y.mjs')).toBe('scripts/y.mjs');
    expect(extractNodeEntry('node ${CLAUDE_PROJECT_DIR}/scripts/hooks/h.cjs')).toBe('scripts/hooks/h.cjs');
    expect(extractNodeEntry('npm run foo')).toBeNull();
    expect(extractNodeEntry('gh run list')).toBeNull();
  });
});

describe('matchNpmScriptRefs', () => {
  const pkg = { 'adam:scan': 'node scripts/adam-opportunity-scan.cjs --scan', 'other': 'node scripts/z.js' };
  it('matches the script whose command runs the target', () => {
    const r = matchNpmScriptRefs('scripts/adam-opportunity-scan.cjs', pkg);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: TRIGGER_TYPES.NPM_SCRIPT, evidence: { script_name: 'adam:scan' } });
  });
  it('returns [] when no script references it', () => {
    expect(matchNpmScriptRefs('scripts/nope.js', pkg)).toEqual([]);
  });
});

describe('matchGhaWorkflowRef', () => {
  const scheduledDirect = {
    file: '.github/workflows/sweep.yml',
    content: 'name: sweep\non:\n  schedule:\n    - cron: \'40 * * * *\'\njobs:\n  go:\n    steps:\n      - run: node scripts/clockwork/sweep.cjs --apply\n',
  };
  it('detects a scheduled workflow running the script directly (INVOKED)', () => {
    const t = matchGhaWorkflowRef('scripts/clockwork/sweep.cjs', scheduledDirect);
    expect(t).toMatchObject({ type: TRIGGER_TYPES.GHA_WORKFLOW, evidence: { scheduled: true, cron: '40 * * * *' } });
  });
  it('resolves an `npm run <name>` indirection to the entry-point', () => {
    const wf = {
      file: '.github/workflows/scan.yml',
      content: 'on:\n  schedule:\n    - cron: \'37 * * * *\'\njobs:\n  s:\n    steps:\n      - run: npm run adam:scan || true\n',
    };
    const idx = indexNpmScripts({ 'adam:scan': 'node scripts/adam-opportunity-scan.cjs' });
    const t = matchGhaWorkflowRef('scripts/adam-opportunity-scan.cjs', wf, idx);
    expect(t.type).toBe(TRIGGER_TYPES.GHA_WORKFLOW);
    expect(t.evidence.scheduled).toBe(true);
  });
  it('reports scheduled=false for a dispatch-only (un-scheduled) workflow', () => {
    const wf = { file: '.github/workflows/manual.yml', content: 'on:\n  workflow_dispatch:\njobs:\n  m:\n    steps:\n      - run: node scripts/clockwork/sweep.cjs\n' };
    const t = matchGhaWorkflowRef('scripts/clockwork/sweep.cjs', wf);
    expect(t.evidence.scheduled).toBe(false);
    expect(t.evidence.cron).toBeNull();
  });
  it('ignores archived workflows entirely', () => {
    const wf = { ...scheduledDirect, file: '.github/workflows/archived/sweep.yml' };
    expect(matchGhaWorkflowRef('scripts/clockwork/sweep.cjs', wf)).toBeNull();
  });
  it('returns null when the workflow does not reference the script', () => {
    expect(matchGhaWorkflowRef('scripts/other.cjs', scheduledDirect)).toBeNull();
  });
});

describe('matchHookRefs', () => {
  const settings = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node ${CLAUDE_PROJECT_DIR}/scripts/hooks/sync.cjs' }] }],
      PostToolUse: [{ matcher: 'Bash', hooks: [{ command: 'node ${CLAUDE_PROJECT_DIR}/scripts/hooks/cap.cjs' }] }],
    },
  };
  it('finds a hook command and reports event + matcher', () => {
    const r = matchHookRefs('scripts/hooks/cap.cjs', settings);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: TRIGGER_TYPES.CLAUDE_HOOK, evidence: { hook_event: 'PostToolUse', matcher: 'Bash' } });
  });
  it('returns [] when not hooked', () => {
    expect(matchHookRefs('scripts/hooks/none.cjs', settings)).toEqual([]);
  });
});

describe('matchLoopContractRef — registration != invocation', () => {
  const contracts = [{
    id: 'LOOP-SWEEP-001',
    timeline: { cadence: '40 * * * *' },
    tasks: [{ task: 'entrypoint', file: 'scripts/clockwork/sweep.cjs' }, { task: 'flag', key: 'SWEEP_ENABLE', default: 'off' }],
  }];
  it('is_invoked=false when the registry entry exists but NO workflow wires it (DATA-ONLY)', () => {
    const t = matchLoopContractRef('scripts/clockwork/sweep.cjs', contracts, []);
    expect(t.evidence).toMatchObject({ loop_id: 'LOOP-SWEEP-001', is_invoked: false, flag_gate: 'SWEEP_ENABLE' });
  });
  it('is_invoked=true once a scheduled workflow wires the same entrypoint', () => {
    const t = matchLoopContractRef('scripts/clockwork/sweep.cjs', contracts, ['scripts/clockwork/sweep.cjs']);
    expect(t.evidence.is_invoked).toBe(true);
  });
  it('returns null when no contract declares the script', () => {
    expect(matchLoopContractRef('scripts/x.cjs', contracts, [])).toBeNull();
  });
});

describe('matchParentShellRef', () => {
  it('detects spawnSync(node, [path]) and execSync(node path)', () => {
    const parent = { file: 'scripts/runner.cjs', content: 'const r = spawnSync(\'node\', [\'scripts/child.cjs\', \'--x\'], {});' };
    const t = matchParentShellRef('scripts/child.cjs', parent);
    expect(t).toMatchObject({ type: TRIGGER_TYPES.PARENT_SCRIPT_SHELL, evidence: { invocation_call: 'spawnSync' } });
  });
  it('does not self-reference', () => {
    const parent = { file: 'scripts/child.cjs', content: 'execSync(\'node scripts/child.cjs\')' };
    expect(matchParentShellRef('scripts/child.cjs', parent)).toBeNull();
  });
  it('returns null when the basename is absent', () => {
    expect(matchParentShellRef('scripts/child.cjs', { file: 'scripts/p.cjs', content: 'doNothing()' })).toBeNull();
  });
});

describe('isExcludedEntry', () => {
  it('excludes one-off/archive/test/underscore-prefixed', () => {
    expect(isExcludedEntry('scripts/one-off/_probe.js')).toBe(true);
    expect(isExcludedEntry('scripts/archive/202606/old.cjs')).toBe(true);
    expect(isExcludedEntry('tests/unit/x.test.js')).toBe(true);
    expect(isExcludedEntry('scripts/real.cjs')).toBe(false);
  });
});

describe('detectInvocationPath — assembler + invocation!=reachability invariant', () => {
  const sources = {
    pkgScripts: { 'sweep': 'node scripts/clockwork/sweep.cjs --apply' },
    workflows: [{
      file: '.github/workflows/sweep.yml',
      content: 'on:\n  schedule:\n    - cron: \'40 * * * *\'\njobs:\n  g:\n    steps:\n      - run: npm run sweep\n',
    }],
    settings: { hooks: {} },
    loopContracts: [{ id: 'LOOP-SWEEP-001', timeline: { cadence: '40 * * * *' }, tasks: [{ task: 'entrypoint', file: 'scripts/clockwork/sweep.cjs' }] }],
    parentScripts: [],
  };

  it('a scheduled+npm+wired-registry script is INVOKED with all three triggers', () => {
    const r = detectInvocationPath('scripts/clockwork/sweep.cjs', sources);
    expect(r.invoked).toBe(true);
    const types = r.triggers.map((t) => t.type).sort();
    expect(types).toContain(TRIGGER_TYPES.NPM_SCRIPT);
    expect(types).toContain(TRIGGER_TYPES.GHA_WORKFLOW);
    expect(types).toContain(TRIGGER_TYPES.LOOP_CONTRACT_REGISTRY);
    const lc = r.triggers.find((t) => t.type === TRIGGER_TYPES.LOOP_CONTRACT_REGISTRY);
    expect(lc.evidence.is_invoked).toBe(true); // wired by the scheduled workflow
  });

  it('REACHABILITY != INVOCATION: a registry-only script with NO scheduled workflow is NOT invoked', () => {
    const dataOnly = {
      pkgScripts: {},
      workflows: [],
      settings: { hooks: {} },
      loopContracts: [{ id: 'LOOP-DORMANT-001', timeline: { cadence: '5 * * * *' }, tasks: [{ task: 'entrypoint', file: 'scripts/dormant.cjs' }] }],
    };
    const r = detectInvocationPath('scripts/dormant.cjs', dataOnly);
    expect(r.invoked).toBe(false); // declared but never wired
    expect(r.triggers).toHaveLength(1);
    expect(r.triggers[0].evidence.is_invoked).toBe(false);
  });

  it('a dispatch-only workflow run-ref does NOT make a script invoked', () => {
    const r = detectInvocationPath('scripts/manual.cjs', {
      workflows: [{ file: '.github/workflows/m.yml', content: 'on:\n  workflow_dispatch:\njobs:\n  j:\n    steps:\n      - run: node scripts/manual.cjs\n' }],
    });
    expect(r.invoked).toBe(false);
    expect(r.triggers[0].evidence.scheduled).toBe(false);
  });

  it('a totally orphan script is not invoked and yields no triggers', () => {
    const r = detectInvocationPath('scripts/orphan.cjs', sources);
    expect(r.invoked).toBe(false);
    expect(r.triggers).toEqual([]);
  });

  it('flags excluded entries while still computing triggers', () => {
    const r = detectInvocationPath('scripts/one-off/_x.js', { pkgScripts: {} });
    expect(r.excluded).toBe(true);
    expect(r.invoked).toBe(false);
  });
});
