/**
 * Tests for MEMORY.md reindex tooling
 * SD-LEO-REFAC-PLAN-MEMORY-INDEX-001
 *
 * Covers TR-1 (no content loss), TR-2 (fixture coverage),
 * TR-3 (byte budget), TR-4 (idempotency) from the PRD.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';

import { reindex } from '../../scripts/modules/memory/reindex.mjs';
import { clusterByPrefix, buildTopicFilename, buildTopicContent } from '../../scripts/modules/memory/clustering.mjs';

const TARGET_BYTES = 15 * 1024;
const MAX_LINE_CHARS = 120;

function fixtureBody(name, description, extras = {}) {
  const kv = { name, description, type: 'feedback', ...extras };
  const yaml = Object.entries(kv).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${yaml}\n---\n\nBody for ${name}.\n`;
}

function makeMemoryDir() {
  return mkdtempSync(join(tmpdir(), 'memreindex-'));
}

describe('clustering.mjs', () => {
  it('groups by prefix when group >= 3', () => {
    const entries = [
      { filename: 'feedback_claim_one.md', parsed: {} },
      { filename: 'feedback_claim_two.md', parsed: {} },
      { filename: 'feedback_claim_three.md', parsed: {} },
      { filename: 'project_x.md', parsed: {} },
      { filename: 'project_y.md', parsed: {} },
      { filename: 'reference_solo.md', parsed: {} },
    ];
    const { topics, standalone } = clusterByPrefix(entries);
    expect(topics).toHaveLength(1);
    expect(topics[0].prefix).toBe('feedback_claim');
    expect(topics[0].members).toHaveLength(3);
    expect(standalone.map(s => s.filename).sort()).toEqual([
      'project_x.md', 'project_y.md', 'reference_solo.md',
    ]);
  });

  it('produces stable ordering (idempotency precondition)', () => {
    const entries = [
      { filename: 'a_one_x.md', parsed: {} },
      { filename: 'a_one_z.md', parsed: {} },
      { filename: 'a_one_y.md', parsed: {} },
    ];
    const r1 = clusterByPrefix(entries);
    const r2 = clusterByPrefix(entries);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('topic content has type:topic frontmatter and member links', () => {
    const content = buildTopicContent('feedback_claim', [
      { filename: 'feedback_claim_one.md', parsed: { name: 'Claim one' } },
      { filename: 'feedback_claim_two.md', parsed: { name: 'Claim two' } },
    ]);
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('type: topic');
    expect(content).toContain('[Claim one](feedback_claim_one.md)');
    expect(content).toContain('[Claim two](feedback_claim_two.md)');
  });
});

describe('reindex.mjs', () => {
  let dir;
  beforeEach(() => { dir = makeMemoryDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('TR-3: MEMORY.md output is <= 15KB on a realistic 50+ file fixture', () => {
    // TR-2 + TR-3: build 50+ files across 8 prefixes, assert byte budget
    const prefixes = ['feedback_claim', 'feedback_auto', 'feedback_tool', 'feedback_session',
                      'project_sd_leo', 'project_sd_uat', 'reference_api', 'user_pref'];
    let count = 0;
    for (const p of prefixes) {
      for (let i = 1; i <= 7; i++) {
        const fn = `${p}_${i}.md`;
        const desc = 'Description text long enough to make the index line exceed the 120-char budget if not truncated by buildIndexLine';
        writeFileSync(join(dir, fn), fixtureBody(`${p} entry ${i}`, desc), 'utf8');
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(50);

    const result = reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });
    expect(result.ok).toBe(true);
    expect(result.indexBytes).toBeLessThanOrEqual(TARGET_BYTES);

    const indexPath = join(dir, 'MEMORY.md');
    const indexContent = readFileSync(indexPath, 'utf8');
    for (const line of indexContent.split('\n').filter(Boolean)) {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    }
  });

  it('TR-1: zero memory-content loss (every original file is reachable)', () => {
    const filenames = [];
    for (let i = 1; i <= 5; i++) {
      const fn = `feedback_a_${i}.md`;
      writeFileSync(join(dir, fn), fixtureBody(`Memory ${i}`, 'd'), 'utf8');
      filenames.push(fn);
    }
    for (let i = 1; i <= 2; i++) {
      const fn = `solo_${i}.md`;
      writeFileSync(join(dir, fn), fixtureBody(`Solo ${i}`, 'd'), 'utf8');
      filenames.push(fn);
    }

    reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });

    const indexContent = readFileSync(join(dir, 'MEMORY.md'), 'utf8');
    const topicFiles = readdirSync(dir).filter(f => f.startsWith('topic_')).map(f => readFileSync(join(dir, f), 'utf8'));
    const allRefs = [indexContent, ...topicFiles].join('\n');

    for (const fn of filenames) {
      expect(allRefs).toContain(fn);
    }
  });

  it('TR-4: idempotency — running twice produces identical MEMORY.md', () => {
    const prefixes = ['feedback_x', 'project_y'];
    for (const p of prefixes) {
      for (let i = 1; i <= 4; i++) {
        writeFileSync(join(dir, `${p}_${i}.md`), fixtureBody(`${p} ${i}`, 'd'), 'utf8');
      }
    }

    reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });
    const first = readFileSync(join(dir, 'MEMORY.md'), 'utf8');
    const firstTopics = readdirSync(dir).filter(f => f.startsWith('topic_')).sort();

    reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });
    const second = readFileSync(join(dir, 'MEMORY.md'), 'utf8');
    const secondTopics = readdirSync(dir).filter(f => f.startsWith('topic_')).sort();

    expect(second).toBe(first);
    expect(secondTopics).toEqual(firstTopics);
  });

  it('TS-3: --preview (dryRun:true) does not write any file', () => {
    writeFileSync(join(dir, 'feedback_a_1.md'), fixtureBody('A1', 'd'), 'utf8');
    writeFileSync(join(dir, 'feedback_a_2.md'), fixtureBody('A2', 'd'), 'utf8');

    const before = readdirSync(dir).sort();
    reindex({ memoryDir: dir, dryRun: true, stderr: new PassThrough() });
    const after = readdirSync(dir).sort();

    expect(after).toEqual(before);
    expect(existsSync(join(dir, 'MEMORY.md'))).toBe(false);
  });

  it('TS-4: empty memory directory produces no topic files and no error', () => {
    const result = reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });
    expect(result.ok).toBe(true);
    expect(result.lineCount).toBe(0);
    expect(result.topicCount).toBe(0);
    expect(readdirSync(dir).filter(f => f.startsWith('topic_'))).toHaveLength(0);
  });

  it('TS-5: all entries below clustering threshold => flat index, no topic files', () => {
    writeFileSync(join(dir, 'a_one.md'), fixtureBody('A', 'd'), 'utf8');
    writeFileSync(join(dir, 'b_two.md'), fixtureBody('B', 'd'), 'utf8');
    writeFileSync(join(dir, 'c_three.md'), fixtureBody('C', 'd'), 'utf8');

    const result = reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });
    expect(result.ok).toBe(true);
    expect(result.topicCount).toBe(0);
    expect(result.lineCount).toBe(3);
    expect(readdirSync(dir).filter(f => f.startsWith('topic_'))).toHaveLength(0);
  });

  it('TR-1 sanity: original memory files are unchanged (sha-equivalent via content read)', () => {
    const fn = 'feedback_immutable_one.md';
    const body = fixtureBody('Immutable', 'do not modify me');
    writeFileSync(join(dir, fn), body, 'utf8');
    writeFileSync(join(dir, 'feedback_immutable_two.md'), fixtureBody('I2', 'd'), 'utf8');
    writeFileSync(join(dir, 'feedback_immutable_three.md'), fixtureBody('I3', 'd'), 'utf8');

    reindex({ memoryDir: dir, dryRun: false, stderr: new PassThrough() });

    const after = readFileSync(join(dir, fn), 'utf8');
    expect(after).toBe(body);
  });

  it('REUSE assertion: reindex.mjs imports parseMemoryFrontmatter from frontmatter.js', () => {
    const source = readFileSync(join(import.meta.url.replace('file://', '').replace(/^\/([A-Z]:)/, '$1').replace('tests/memory/reindex.test.js', 'scripts/modules/memory/reindex.mjs')), 'utf8');
    expect(source).toContain("from './frontmatter.js'");
    expect(source).toContain('parseMemoryFrontmatter');
  });
});
