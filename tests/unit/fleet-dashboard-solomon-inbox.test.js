/**
 * fleet-dashboard-solomon-inbox.test.js — SD-LEO-INFRA-SOLOMON-CONSULT-001F
 *
 * Source-level pins for the PENDING SOLOMON CONSULTS dashboard surface. Network-free
 * (no supabase client, no DB) — it reads the script source and asserts the structural
 * + correctness invariants so a future edit can't silently regress them:
 *   - printSolomonInbox exists and is wired into the `all` view, a `solomon` command,
 *     and the usage list.
 *   - It gates on `acknowledged_at IS NULL` (the ACTIONED signal), NOT read_at.
 *   - It is PURE-READ: the function body never stamps read_at/acknowledged_at — so a
 *     dashboard render can NEVER hide an unactioned consult from solomon-advisory.cjs
 *     drainInbox (which filters on read_at IS NULL). This is the parked-render-hides-
 *     consult bug class; the test locks the fix in.
 *   - It discriminates the lane on payload.kind === 'solomon_consult'.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../scripts/fleet-dashboard.cjs'), 'utf8');

// Extract just the printSolomonInbox function body (from its declaration to the next
// top-level `async function`/`function` declaration) so body-scoped assertions are exact.
function printSolomonInboxBody() {
  const start = SRC.indexOf('async function printSolomonInbox(');
  expect(start).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const nextFn = rest.search(/\n(?:async function|function) /);
  return nextFn === -1 ? rest : rest.slice(0, nextFn);
}

describe('Phase F — printSolomonInbox dashboard surface', () => {
  it('printSolomonInbox is defined', () => {
    expect(SRC).toMatch(/async function printSolomonInbox\s*\(/);
  });

  it('is wired into the `all` view, a `solomon` command, and the usage list', () => {
    // dedicated command alias
    expect(SRC).toMatch(/solomon:\s*async \(\) => await printSolomonInbox\(\)/);
    // present in the `all` aggregate render
    const allIdx = SRC.indexOf('all:');
    expect(allIdx).toBeGreaterThan(-1);
    expect(SRC.indexOf('await printSolomonInbox()', allIdx)).toBeGreaterThan(allIdx);
    // discoverable in the usage string
    expect(SRC).toMatch(/Sections:[^\n]*\bsolomon\b/);
  });

  it('gates pending on acknowledged_at IS NULL (the actioned signal), not read_at', () => {
    const body = printSolomonInboxBody();
    expect(body).toMatch(/\.is\(\s*['"]acknowledged_at['"]\s*,\s*null\s*\)/);
  });

  it('is PURE-READ — never stamps read_at or acknowledged_at (cannot hide a consult from the oracle drain)', () => {
    const body = printSolomonInboxBody();
    // No mutation of delivery/ack columns anywhere in the render.
    expect(body).not.toMatch(/\.update\(\s*\{[^}]*read_at/);
    expect(body).not.toMatch(/\.update\(\s*\{[^}]*acknowledged_at/);
    // Blanket guard: a pure-read render has NO reason to upsert/rpc/update at all,
    // so any write form (not just .update({read_at})) is a regression of the invariant.
    expect(body).not.toMatch(/\.upsert\(/);
    expect(body).not.toMatch(/\.rpc\(/);
    expect(body).not.toMatch(/\.update\(/);
  });

  it('discriminates the lane on payload.kind === "solomon_consult"', () => {
    const body = printSolomonInboxBody();
    expect(body).toMatch(/kind\s*===\s*['"]solomon_consult['"]/);
  });

  it('resolves the live Solomon and falls back to the broadcast-solomon buffer', () => {
    const body = printSolomonInboxBody();
    expect(body).toMatch(/getActiveSolomonId/);
    expect(body).toMatch(/broadcast-solomon/);
  });
});
