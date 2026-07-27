/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3 — resume threading through the choke point.
 *
 * Static source assertions. spawn() launches a detached process and writes claude_sessions, so
 * executing it in a unit test would either mock away the very wiring under test or touch the DB.
 * The invariants here are about WHAT IS PASSED, which the source states exactly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.resolve(HERE, '../../../lib/fleet/spawn-control.js'), 'utf8');

describe('FR3-THREAD: resumeUuid reaches the launch builder', () => {
  it('spawn() FORWARDS resumeUuid — it was accepted by the builder but never passed', () => {
    // buildLiveSpawnInvocation has always accepted resumeUuid. spawn() did not forward it, so a
    // caller could set opts.resumeUuid and have it silently ignored: the launch came up cold
    // while every signature looked correct.
    const call = SOURCE.match(/buildLiveSpawnInvocation\(\{[\s\S]{0,320}?\}, opts\)/);
    expect(call, 'buildLiveSpawnInvocation call not found').toBeTruthy();
    expect(call[0]).toMatch(/resumeUuid:\s*opts\.resumeUuid/);
  });

  it('spawn() also forwards sessionId, so a FORK can carry a fresh identity', () => {
    const call = SOURCE.match(/buildLiveSpawnInvocation\(\{[\s\S]{0,320}?\}, opts\)/);
    expect(call[0]).toMatch(/sessionId:\s*opts\.sessionId/);
  });
});

describe('FR3-CWD: the replacement resumes where the OLD seat lived', () => {
  it('spawnReplacement reads launch_cwd off the OLD session, not this process cwd', () => {
    const fn = SOURCE.slice(SOURCE.indexOf('async function spawnReplacement'));
    expect(fn).toMatch(/oldSession\.metadata\.launch_cwd/);
    expect(fn).toMatch(/cwd:\s*launchCwd/);
  });

  it('spawnReplacement threads resumeUuid through rather than dropping it', () => {
    const fn = SOURCE.slice(SOURCE.indexOf('async function spawnReplacement'));
    expect(fn).toMatch(/resumeUuid:\s*opts\.resumeUuid/);
  });

  it('spawn() PERSISTS launch_cwd, so the read above has something to find', () => {
    // Threading without persisting would leave the read permanently undefined — wiring that
    // looks complete and does nothing.
    expect(SOURCE).toMatch(/launch_cwd:\s*invocation\.cwd/);
  });

  it('launch_cwd is stamped from the INVOCATION, never process.cwd()', () => {
    const stamp = SOURCE.match(/launch_cwd:[^\n,}]*/)[0];
    expect(stamp).not.toMatch(/process\.cwd/);
  });
});

describe('FR3-TOKEN: metadata.resume_uuid is not the token', () => {
  it('spawn-control never reads metadata.resume_uuid', () => {
    // Populated on 1 of 13,025 rows. Comments are stripped first so the guard tests CODE, not
    // the rationale that explains why the field must not be read.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/metadata\s*[.[]\s*['"]?resume_uuid/);
  });
});
