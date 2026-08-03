// SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-5). The divergence check exported three pure
// functions shaped for testing and had no tests — a checker nobody verified, guarding a
// condition nobody runs. These pin the two properties that actually matter: absence is
// SAFE (the ancestor walk reaches the root), and secrets never reach the output.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  TRACKED_KEYS,
  readEnvKeys,
  findDivergences,
  resolveMainRepoRoot
} from '../../scripts/audit-worktree-env-divergence.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'wt-env-'));
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

const mkWorktree = (name, envBody) => {
  const dir = path.join(tmp, name);
  mkdirSync(dir, { recursive: true });
  if (envBody !== null) writeFileSync(path.join(dir, '.env'), envBody, 'utf8');
  return dir;
};

const ROOT_ENV = path.join(tmp, 'root.env');
writeFileSync(ROOT_ENV, 'LEO_MIGRATION_TIER_GATE=on\nSUPABASE_SERVICE_ROLE_KEY=sk_root_secret\n', 'utf8');

describe('readEnvKeys — only tracked keys are ever captured', () => {
  it('captures a tracked key and NOTHING else', () => {
    const f = path.join(tmp, 'sample.env');
    writeFileSync(f, 'LEO_MIGRATION_TIER_GATE=off\nSUPABASE_SERVICE_ROLE_KEY=sk_live_leak\nOPENAI_API_KEY=sk-openai\n', 'utf8');
    const got = readEnvKeys(f);
    expect([...got.keys()]).toEqual(['LEO_MIGRATION_TIER_GATE']);
    expect(JSON.stringify([...got])).not.toContain('sk_live_leak');
    expect(JSON.stringify([...got])).not.toContain('sk-openai');
  });

  it('strips surrounding quotes and whitespace', () => {
    const f = path.join(tmp, 'quoted.env');
    writeFileSync(f, 'LEO_MIGRATION_TIER_GATE = "on" \n', 'utf8');
    expect(readEnvKeys(f).get('LEO_MIGRATION_TIER_GATE')).toBe('on');
  });

  it('an unreadable file yields an empty map rather than throwing', () => {
    expect(readEnvKeys(path.join(tmp, 'nope.env')).size).toBe(0);
  });

  it('tracks the break-glass variable, and no secret-shaped key is tracked', () => {
    expect(TRACKED_KEYS).toContain('LEO_MIGRATION_TIER_GATE_FORCE_ON');
    for (const k of TRACKED_KEYS) expect(k).not.toMatch(/KEY|SECRET|TOKEN|PASSWORD/i);
  });
});

describe('findDivergences — absence is SAFE, disagreement is not', () => {
  it('a worktree with NO .env is not scanned and not an offender', () => {
    const dirs = [mkWorktree('no-env', null)];
    const { offenders, scanned } = findDivergences(ROOT_ENV, dirs);
    // This is the premise the SD got wrong: env resolution walks UP, so no local copy
    // means the shared root is inherited — safe, not vulnerable.
    expect(scanned).toBe(0);
    expect(offenders).toHaveLength(0);
  });

  it('a .env that OMITS the key inherits the root and is not an offender', () => {
    const dirs = [mkWorktree('omits', 'FOO=bar\n')];
    const { offenders, scanned } = findDivergences(ROOT_ENV, dirs);
    expect(scanned).toBe(1);
    expect(offenders).toHaveLength(0);
  });

  it('a matching value is not an offender', () => {
    const dirs = [mkWorktree('agrees', 'LEO_MIGRATION_TIER_GATE=on\n')];
    expect(findDivergences(ROOT_ENV, dirs).offenders).toHaveLength(0);
  });

  it('a DIFFERENT value IS an offender, and names the worktree', () => {
    const dirs = [mkWorktree('diverges', 'LEO_MIGRATION_TIER_GATE=off\n')];
    const { offenders } = findDivergences(ROOT_ENV, dirs);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatchObject({ worktree: 'diverges', key: 'LEO_MIGRATION_TIER_GATE', local: 'off', root: 'on' });
  });

  it('divergence is detected in BOTH directions, including a key unset at the root', () => {
    const rootBare = path.join(tmp, 'bare-root.env');
    writeFileSync(rootBare, 'FOO=bar\n', 'utf8');
    const dirs = [mkWorktree('local-only', 'LEO_MIGRATION_TIER_GATE_FORCE_ON=1\n')];
    const { offenders } = findDivergences(rootBare, dirs);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].root).toBe('(unset at root)');
  });

  it('NEVER emits a non-tracked value, even when both files carry secrets', () => {
    const rootSecret = path.join(tmp, 'secret-root.env');
    writeFileSync(rootSecret, 'LEO_MIGRATION_TIER_GATE=on\nSUPABASE_SERVICE_ROLE_KEY=sk_root\n', 'utf8');
    const dirs = [mkWorktree('secret-wt', 'LEO_MIGRATION_TIER_GATE=off\nSUPABASE_SERVICE_ROLE_KEY=sk_worktree\nOPENAI_API_KEY=sk-oai\n')];
    const serialised = JSON.stringify(findDivergences(rootSecret, dirs));
    expect(serialised).toContain('secret-wt');
    for (const secret of ['sk_root', 'sk_worktree', 'sk-oai', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('scanned counts only worktrees carrying a local .env, so "clean" can be distinguished from "looked at nothing"', () => {
    const dirs = [mkWorktree('a', null), mkWorktree('b', 'LEO_MIGRATION_TIER_GATE=on\n'), mkWorktree('c', null)];
    expect(findDivergences(ROOT_ENV, dirs).scanned).toBe(1);
  });
});

describe('resolveMainRepoRoot — the wrong-root trap', () => {
  it('resolves the MAIN repo root from inside a worktree, not the worktree itself', () => {
    // The first version resolved __dirname/.., which inside a worktree is the worktree —
    // so it compared the tree against itself and printed a green "0 scanned".
    const fromWorktree = resolveMainRepoRoot(path.join(process.cwd(), 'scripts'));
    expect(fromWorktree.replace(/\\/g, '/')).not.toMatch(/\.worktrees\//);
  });
});
