/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-B (FR-2) — requires-invocation classifier.
 * Conservative: default FALSE; TRUE only on a GENUINE autonomous signal (registry / cron-dir /
 * -loop suffix / in-code scheduling) — never a bare filename substring. The false-VIOLATION
 * direction (a non-runner classified requires=true) is the worst failure and is pinned below.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRequiresInvocation,
  isLoopContractEntrypoint,
  isMissingInvocationViolation,
} from '../../../lib/invocation-detector/requires-invocation.js';

describe('classifyRequiresInvocation — positive (genuine autonomous) signals', () => {
  it('a script under scripts/cron/ requires a trigger', () => {
    const r = classifyRequiresInvocation('scripts/cron/leo-build-starter.mjs');
    expect(r.requiresInvocation).toBe(true);
    expect(r.reason).toMatch(/cron\/clockwork/);
  });
  it('a clockwork-dir loop file requires a trigger', () => {
    expect(classifyRequiresInvocation('scripts/clockwork/prod-error-sweep-loop.cjs').requiresInvocation).toBe(true);
  });
  it('a -loop / -sweep suffix filename requires a trigger (suffix-anchored)', () => {
    expect(classifyRequiresInvocation('scripts/ci-autotriage-loop.cjs').requiresInvocation).toBe(true);
    expect(classifyRequiresInvocation('scripts/error-sweep.mjs').requiresInvocation).toBe(true);
  });
  it('a declared loop-contract entrypoint requires a trigger (overrides location)', () => {
    const contracts = [{ id: 'L1', tasks: [{ task: 'entrypoint', file: 'scripts/plain-name.cjs' }] }];
    expect(classifyRequiresInvocation('scripts/plain-name.cjs', { loopContracts: contracts }).requiresInvocation).toBe(true);
  });
  it('a runnable program with in-code scheduling semantics requires a trigger', () => {
    const content = '#!/usr/bin/env node\nasync function main(){ setInterval(()=>{}, 3600000); }\nmain();';
    expect(classifyRequiresInvocation('scripts/some-runner.mjs', { content }).requiresInvocation).toBe(true);
  });
});

describe('classifyRequiresInvocation — conservative FALSE (no false violations)', () => {
  it('a test file never requires a trigger', () => {
    expect(classifyRequiresInvocation('tests/unit/x.test.js').requiresInvocation).toBe(false);
    expect(classifyRequiresInvocation('scripts/foo.spec.cjs').requiresInvocation).toBe(false);
  });
  it('one-off / archived scripts never require a trigger', () => {
    expect(classifyRequiresInvocation('scripts/one-off/_probe.js').requiresInvocation).toBe(false);
    expect(classifyRequiresInvocation('scripts/archive/old.cjs').requiresInvocation).toBe(false);
  });
  it('ANY lib/ module is not required — content-independent (adversarial HIGH-1)', () => {
    expect(classifyRequiresInvocation('lib/invocation-detector/index.js').requiresInvocation).toBe(false);
    // path-only (no content) autonomous-NAMED lib files must STILL be false:
    expect(classifyRequiresInvocation('lib/ui/scroll-loop-helper.js').requiresInvocation).toBe(false);
    expect(classifyRequiresInvocation('lib/state/action-dispatcher.js').requiresInvocation).toBe(false);
    expect(classifyRequiresInvocation('lib/perf/performance-monitor-lib.js').requiresInvocation).toBe(false);
  });
  it('the loop-contract REGISTRY (a data file under lib/loops) is NOT required (adversarial MED-1)', () => {
    expect(classifyRequiresInvocation('lib/loops/loop-contract-registry.js').requiresInvocation).toBe(false);
  });
  it('manual CLIs with autonomous-ish substrings but no genuine signal are NOT required (adversarial HIGH-2)', () => {
    const main = 'async function main(){ console.log("one shot"); }\nmain();';
    for (const p of [
      'scripts/cache-populator.js',
      'scripts/db-monitor.js',
      'scripts/queue-dispatcher.js',
      'scripts/release-reaper.js',
      'scripts/event-loop-util.js',
      'scripts/app-starter.mjs',
    ]) {
      expect(classifyRequiresInvocation(p, { content: main }).requiresInvocation, p).toBe(false);
    }
  });
  it('a plain runnable CLI with no scheduling semantics defaults to FALSE', () => {
    const content = '#!/usr/bin/env node\nasync function main(){ console.log("report"); }\nmain();';
    expect(classifyRequiresInvocation('scripts/print-report.mjs', { content }).requiresInvocation).toBe(false);
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
    expect(isMissingInvocationViolation('scripts/cron/live-loop.mjs', { invoked: true }).violation).toBe(false);
  });
  it('a library is never a violation even when not invoked', () => {
    const v = isMissingInvocationViolation('lib/util.js', { invoked: false }, { content: 'export const a=1;' });
    expect(v.violation).toBe(false);
    expect(v.reason).toMatch(/does not require/);
  });
  it('a manual CLI with an autonomous-ish name is NOT a violation (conservative)', () => {
    expect(isMissingInvocationViolation('scripts/cache-populator.js', { invoked: false }, { content: 'async function main(){}\nmain();' }).violation).toBe(false);
  });
});
