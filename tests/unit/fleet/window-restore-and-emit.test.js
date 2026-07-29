/**
 * SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A — FR-5 (window_visible reaches the client) and FR-7 (the
 * DB-free panic restore). TS-7 and TS-10.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatSessionRow } from '../../../server/routes/fleet-panel.js';
import {
  buildRestoreCommand,
  parseRestoreResult,
  restoreAllTerminalWindows,
  TERMINAL_PROCESS_NAME,
} from '../../../scripts/fleet-restore-windows.mjs';

const row = (metadata) => ({ session_id: 's1', metadata, computed_status: 'active' });

describe('FR-5 / TS-7: window_visible reaches the client, and absent is NOT "visible"', () => {
  it('emits true when recorded visible, false when recorded hidden', () => {
    expect(formatSessionRow(row({ window_visible: true })).window_visible).toBe(true);
    expect(formatSessionRow(row({ window_visible: false })).window_visible).toBe(false);
  });

  it('emits NULL when never recorded — the distinction the whole SD is about', () => {
    // Rendering absent as "Open" is the current defect in a new field: a confident visibility claim
    // the system never checked. Measured across live seats before this SD: window_visible 0/9.
    expect(formatSessionRow(row({})).window_visible).toBeNull();
    expect(formatSessionRow(row({ window_visible: null })).window_visible).toBeNull();
    expect(formatSessionRow(row(undefined)).window_visible).toBeNull();
  });

  it('null is DISTINGUISHABLE from false — not merged into one falsy state', () => {
    // The trap: `Boolean(meta.window_visible)` would collapse never-recorded into recorded-hidden,
    // and the operator could not tell "we hid it" from "we have no idea".
    const never = formatSessionRow(row({})).window_visible;
    const hidden = formatSessionRow(row({ window_visible: false })).window_visible;
    expect(never).toBeNull();
    expect(hidden).toBe(false);
    expect(never).not.toBe(hidden);
  });

  it('does not disturb the fields already emitted', () => {
    const out = formatSessionRow(row({ window_visible: true }));
    for (const k of ['session_id', 'identity_kind', 'status', 'sd_key', 'model_effort']) {
      expect(out).toHaveProperty(k);
    }
  });
});

describe('FR-7 / TS-10: the panic restore needs no database', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../../scripts/fleet-restore-windows.mjs', import.meta.url)), 'utf8');

  it('imports NOTHING but node builtins — a DB import would make the panic case unreachable', () => {
    // THE ACCEPTANCE CRITERION, asserted structurally. The panic case includes a dead server and an
    // untrusted database: this recovery must not read the rows the feature may have corrupted.
    const imports = [...src.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).toMatch(/^node:/);
  });

  it('is not route-only — it exposes a directly runnable entrypoint', () => {
    // A route-only implementation fails FR-7: the panic case includes the server being down.
    expect(src).toContain('#!/usr/bin/env node');
    expect(typeof restoreAllTerminalWindows).toBe('function');
  });

  it('enumerates WITHOUT the IsWindowVisible gate — the one predicate that hides hidden windows', () => {
    // Measured: 348 top-level windows on this host, 36 visible, 312 hidden AND ENUMERABLE. They are
    // excluded from normal enumeration by exactly one predicate. This command must not re-add it
    // around the collection, or the panic button cannot see the windows it exists to rescue.
    const script = buildRestoreCommand().args[3];
    expect(script).toContain('EnumWindows');
    expect(script).toContain('ShowWindow');
    // The Add must not be gated on visibility. It may still READ visibility to count/skip.
    expect(script).not.toMatch(/if\s*\(\s*IsWindowVisible\s*\(\s*h\s*\)\s*\)\s*\{?\s*[^}]*r\.Add/);
  });

  it('dry-run builds a command that shows nothing', () => {
    expect(buildRestoreCommand({ dryRun: true }).args[3]).not.toContain('FleetRestore]::Show');
    expect(buildRestoreCommand({ dryRun: false }).args[3]).toContain('FleetRestore]::Show');
  });

  it('targets the terminal host and refuses an injectable process name', () => {
    expect(buildRestoreCommand().args[3]).toContain(TERMINAL_PROCESS_NAME);
    for (const bad of ['', 'x; whoami', "a' -or '1"]) {
      expect(() => buildRestoreCommand({ processName: bad })).toThrow();
    }
  });

  it('reports counts, and never reports success on unparseable output', async () => {
    const ok = await restoreAllTerminalWindows({ execFn: async () => 'RESTORE|17|8' });
    expect(ok).toMatchObject({ ok: true, terminalWindows: 17, restored: 8 });
    for (const junk of ['', 'nope', 'RESTORE|', 'RESTORE|x|y']) {
      const r = await restoreAllTerminalWindows({ execFn: async () => junk });
      expect(r.ok).toBe(false);
    }
  });

  it('an exec failure is reported, not thrown — a panic tool must not stack-trace', async () => {
    const r = await restoreAllTerminalWindows({ execFn: async () => { throw new Error('powershell missing'); } });
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toMatch(/invocation_failed/);
  });

  it('parseRestoreResult is total', () => {
    for (const v of [undefined, null, '', 0, {}, 'RESTORE']) expect(() => parseRestoreResult(v)).not.toThrow();
  });
});
