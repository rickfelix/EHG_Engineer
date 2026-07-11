/**
 * SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 — fleet-dashboard.cjs re-keyed sections.
 *
 * Source-level pins (network-free, no supabase client), mirroring the existing
 * fleet-dashboard-solomon-inbox.test.js pattern: printInbox, printCoordination, and
 * printSolomonInbox now consult hasCorrelatedReply before reporting their headline
 * ack-null-derived counts. printCoaching is explicitly untouched (RETAIN-AS-IS: an
 * intentional per-message ack, not a reply-correlation scenario).
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../scripts/fleet-dashboard.cjs'), 'utf8');

function functionBody(startMarker) {
  const start = SRC.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const nextFn = rest.search(/\n(?:async function|function) /);
  return nextFn === -1 ? rest : rest.slice(0, nextFn);
}

describe('SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 — reply-correlation primitive is wired in', () => {
  it('top-level require of hasCorrelatedReply exists', () => {
    expect(SRC).toMatch(/require\(['"]\.\.\/lib\/coordinator\/reply-correlation\.cjs['"]\)/);
  });
});

describe('printInbox — headline unread count excludes correlated-reply rows', () => {
  it('references hasCorrelatedReply in its true-unread computation', () => {
    const body = functionBody('async function printInbox(');
    expect(body).toMatch(/hasCorrelatedReply/);
  });

  it('no longer uses a head-only count query for the true-unread total (needs row data to correlate)', () => {
    const body = functionBody('async function printInbox(');
    expect(body).not.toMatch(/count:\s*['"]exact['"]\s*,\s*head:\s*true/);
  });
});

describe('printCoordination — pending-acknowledgment count excludes correlated-reply rows', () => {
  it('references hasCorrelatedReply in its pending computation', () => {
    const body = functionBody('function printCoordination(');
    expect(body).toMatch(/hasCorrelatedReply/);
  });
});

describe('printSolomonInbox — pending-consult count excludes correlated-reply rows', () => {
  it('references hasCorrelatedReply after fetching Solomon\'s own outbound replies', () => {
    const body = functionBody('async function printSolomonInbox(');
    expect(body).toMatch(/hasCorrelatedReply/);
    expect(body).toMatch(/sender_session/);
  });

  it('remains PURE-READ — the new correlation lookup is a .select() only, no write', () => {
    const body = functionBody('async function printSolomonInbox(');
    expect(body).not.toMatch(/\.update\(\s*\{[^}]*read_at/);
    expect(body).not.toMatch(/\.update\(\s*\{[^}]*acknowledged_at/);
    expect(body).not.toMatch(/\.upsert\(/);
    expect(body).not.toMatch(/\.rpc\(/);
    expect(body).not.toMatch(/\.update\(/);
  });
});

describe('printCoaching — RETAIN-AS-IS disposition (untouched)', () => {
  it('Acked/Read/Unread tally is unchanged — no correlation logic added', () => {
    const body = functionBody('async function printCoaching(');
    expect(body).not.toMatch(/hasCorrelatedReply/);
    expect(body).toContain('Acked:');
    expect(body).toMatch(/const acked = coaching\.filter/);
  });
});
