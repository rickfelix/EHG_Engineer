// Vitest fixture for scripts/pocock/audit-skill-bodies.mjs
// SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-E FR-9 (9 enumerated cases)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAudit, computeBodyLoc, MAX_SKILL_BODY_LOC } from '../audit-skill-bodies.mjs';

async function mkTmpRoot() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'skill-body-audit-'));
}

async function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, 'utf8');
}

function body(n) {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');
}

describe('audit-skill-bodies', () => {
  let root;
  beforeEach(async () => { root = await mkTmpRoot(); });
  afterEach(async () => { await fsp.rm(root, { recursive: true, force: true }); });

  it('Case 1 — under threshold (199 LOC) is compliant', async () => {
    await writeFile(root, '.claude/commands/under.md', body(199));
    const { rows } = await runAudit({ root, write: false });
    const row = rows.find(r => r.path === '.claude/commands/under.md');
    expect(row.body_loc).toBe(199);
    expect(row.status).toBe('COMPLIANT');
  });

  it('Case 2 — exactly 200 LOC is compliant (strict >)', async () => {
    await writeFile(root, '.claude/commands/at-threshold.md', body(200));
    const { rows } = await runAudit({ root, write: false });
    const row = rows.find(r => r.path === '.claude/commands/at-threshold.md');
    expect(row.body_loc).toBe(200);
    expect(row.status).toBe('COMPLIANT');
  });

  it('Case 3 — 201 LOC is an offender (boundary)', async () => {
    await writeFile(root, '.claude/commands/over.md', body(201));
    const { rows } = await runAudit({ root, write: false });
    const row = rows.find(r => r.path === '.claude/commands/over.md');
    expect(row.body_loc).toBe(201);
    expect(row.status).toBe('OFFENDER');
    expect(row.overage).toBe(1);
  });

  it('Case 4 — frontmatter-only file has body LOC 0', async () => {
    const content = '---\nname: fm-only\ndescription: just frontmatter\n---\n';
    await writeFile(root, '.claude/commands/fm-only.md', content);
    const { rows } = await runAudit({ root, write: false });
    const row = rows.find(r => r.path === '.claude/commands/fm-only.md');
    expect(row.body_loc).toBe(0);
    expect(row.status).toBe('COMPLIANT');
  });

  it('Case 5 — BOM-prefixed file has BOM stripped before count', async () => {
    const bom = '﻿';
    await writeFile(root, '.claude/commands/bom.md', bom + body(5));
    const { rows } = await runAudit({ root, write: false });
    const row = rows.find(r => r.path === '.claude/commands/bom.md');
    expect(row.body_loc).toBe(5);
  });

  it('Case 6 — CRLF file matches LF equivalent', async () => {
    await writeFile(root, '.claude/commands/crlf.md', body(10).split('\n').join('\r\n'));
    await writeFile(root, '.claude/commands/lf.md', body(10));
    const { rows } = await runAudit({ root, write: false });
    const crlf = rows.find(r => r.path === '.claude/commands/crlf.md');
    const lf = rows.find(r => r.path === '.claude/commands/lf.md');
    expect(crlf.body_loc).toBe(lf.body_loc);
    expect(crlf.body_loc).toBe(10);
  });

  it('Case 7 — idempotency: byte-identical report across runs', async () => {
    await writeFile(root, '.claude/commands/a.md', body(50));
    await writeFile(root, '.claude/commands/b.md', body(60));
    const reportPath = path.join(root, 'skills', 'SKILL-BODY-AUDIT-REPORT.md');
    await runAudit({ root, write: true, reportPath });
    const first = await fsp.readFile(reportPath, 'utf8');
    await runAudit({ root, write: true, reportPath });
    const second = await fsp.readFile(reportPath, 'utf8');
    expect(second).toBe(first);
  });

  it('Case 8 — top-3 tiebreak: equal body_loc resolves alphabetically by path', async () => {
    await writeFile(root, '.claude/commands/aaa.md', body(500));
    await writeFile(root, '.claude/commands/bbb.md', body(400));
    await writeFile(root, '.claude/commands/ccc.md', body(400));
    await writeFile(root, '.claude/commands/ddd.md', body(400));
    await writeFile(root, '.claude/commands/eee.md', body(300));
    const { summary } = await runAudit({ root, write: false });
    expect(summary.top_offenders.length).toBe(3);
    expect(summary.top_offenders[0].path).toBe('.claude/commands/aaa.md');
    expect(summary.top_offenders[1].path).toBe('.claude/commands/bbb.md');
    expect(summary.top_offenders[2].path).toBe('.claude/commands/ccc.md');
  });

  it('Case 9 — empty tree produces zero-row report without crashing', async () => {
    const { rows, summary, top3 } = await runAudit({ root, write: false });
    expect(rows.length).toBe(0);
    expect(summary.offender_count).toBe(0);
    expect(top3.length).toBe(0);
  });

  it('frontmatter strip is anchored to file start (--- mid-document is not stripped)', async () => {
    const content = 'intro line\n---\nthis is a horizontal rule, not frontmatter\nmore body\n';
    await writeFile(root, '.claude/commands/hrule.md', content);
    const { rows } = await runAudit({ root, write: false });
    const row = rows.find(r => r.path === '.claude/commands/hrule.md');
    expect(row.body_loc).toBe(4);
  });

  it('MAX_SKILL_BODY_LOC export is 200', () => {
    expect(MAX_SKILL_BODY_LOC).toBe(200);
  });

  it('computeBodyLoc strips HTML reasoning_effort comments', () => {
    const raw = '<!-- reasoning_effort: high -->\nactual line 1\nactual line 2\n';
    expect(computeBodyLoc(raw)).toBe(3);
  });
});
