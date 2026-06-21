/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-B (FR-2) — requires-invocation classifier.
 * Conservative: default FALSE; only a positive autonomous signal returns TRUE (a false
 * "requires" would produce a false violation).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRequiresInvocation,
  isLoopContractEntrypoint,
  isMissingInvocationViolation,
} from '../../../lib/invocation-detector/requires-invocation.js';

describe('classifyRequiresInvocation — positive (autonomous) signals', () => {
  it('a script under scripts/cron/ requires a trigger', () => {
    const r = classifyRequiresInvocation('scripts/cron/leo-build-starter.mjs');
    expect(r.requiresInvocation).toBe(true);
    expect(r.reason).toMatch(/cron\/clockwork\/loops dir/);
  });
  it('a clockwork loop file requires a trigger (dir + name)', () => {
    expect(classifyRequiresInvocation('scripts/clockwork/prod-error-sweep-loop.cjs').requiresInvocation).toBe(true);
  });
  it('an autonomous-runner filename pattern requires a trigger', () => {
    expect(classifyRequiresInvocation('scripts/worktree-reaper.mjs').requiresInvocation).toBe(true);
    expect(classifyRequiresInvocation('scripts/adam-opportunity-scan-monitor.cjs').requiresInvocation).toBe(true);
  });
  it('a declared loop-contract entrypoint requires a trigger', () => {
    const contracts = [{ id: 'L1', tasks: [{ task: 'entrypoint', file: 'scripts/plain-name.cjs' }] }];
    const r = classifyRequiresInvocation('scripts/plain-name.cjs', { loopContracts: contracts });
    expect(r.requiresInvocation).toBe(true);
    expect(r.reason).toMatch(/loop-contract/);
  });
  it('a runnable program with schedule/tick semantics in content requires a trigger', () => {
    const content = '#!/usr/bin/env node\nasync function main(){ /* runs every hour */ setInterval(()=>{}, 3600000); }\nmain();';
    expect(classifyRequiresInvocation('scripts/some-runner.mjs', { content }).requiresInvocation).toBe(true);
  });
});

describe('classifyRequiresInvocation — negative (conservative) signals', () => {
  it('a test file never requires a trigger', () => {
    expect(classifyRequiresInvocation('tests/unit/x.test.js').requiresInvocation).toBe(false);
    expect(classifyRequiresInvocation('scripts/foo.spec.cjs').requiresInvocation).toBe(false);
  });
  it('a one-off / archived script never requires a trigger', () => {
    expect(classifyRequiresInvocation('scripts/one-off/_probe.js').requiresInvocation).toBe(false);
    expect(classifyRequiresInvocation('scripts/archive/old.cjs').requiresInvocation).toBe(false);
  });
  it('a pure library module (lib/, no runnable surface) never requires a trigger', () => {
    const r = classifyRequiresInvocation('lib/invocation-detector/index.js', { content: 'export function f(){}\nexport const X=1;' });
    expect(r.requiresInvocation).toBe(false);
    expect(r.reason).toMatch(/library/);
  });
  it('a plain manually-invoked CLI with NO autonomous signal defaults to NOT required', () => {
    const content = '#!/usr/bin/env node\nasync function main(){ console.log("does a one-shot thing"); }\nmain();';
    const r = classifyRequiresInvocation('scripts/print-report.mjs', { content });
    expect(r.requiresInvocation).toBe(false); // conservative: no cron/loop/sweep signal
  });
  it('empty path is not required', () => {
    expect(classifyRequiresInvocation('').requiresInvocation).toBe(false);
  });
});

describe('isLoopContractEntrypoint', () => {
  const contracts = [{ id: 'L1', tasks: [{ task: 'entrypoint', file: 'scripts/x.cjs' }, { task: 'flag', key: 'K' }] }];
  it('matches a declared entrypoint and ignores non-entrypoint tasks', () => {
    expect(isLoopContractEntrypoint('scripts/x.cjs', contracts)).toBe(true);
    expect(isLoopContractEntrypoint('scripts/y.cjs', contracts)).toBe(false);
  });
});

describe('isMissingInvocationViolation — pairs FR-2 with FR-1', () => {
  it('requires + NOT invoked → VIOLATION', () => {
    const v = isMissingInvocationViolation('scripts/cron/dead-loop.mjs', { invoked: false });
    expect(v.violation).toBe(true);
    expect(v.reason).toMatch(/VIOLATION/);
  });
  it('requires + invoked → not a violation', () => {
    const v = isMissingInvocationViolation('scripts/cron/live-loop.mjs', { invoked: true });
    expect(v.violation).toBe(false);
  });
  it('does-not-require (library) → never a violation even when not invoked', () => {
    const v = isMissingInvocationViolation('lib/util.js', { invoked: false }, { content: 'export const a=1;' });
    expect(v.violation).toBe(false);
    expect(v.reason).toMatch(/does not require/);
  });
  it('a manually-invoked CLI with no trigger is NOT a violation (conservative)', () => {
    const v = isMissingInvocationViolation('scripts/one-shot-tool.mjs', { invoked: false }, { content: 'async function main(){}\nmain();' });
    expect(v.violation).toBe(false);
  });
});
