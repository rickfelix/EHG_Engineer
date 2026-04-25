import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appendAuditEntry, DEFAULT_AUDIT_LOG_PATH } from './audit-log.js';

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('appendAuditEntry', () => {
  it('writes one JSON line with timestamp + payload fields', () => {
    const result = appendAuditEntry(
      { file: 'a.md', category: 'commit', pattern: 'docs/*.md', occurrences: 4 },
      { repoRoot: tmpRoot }
    );
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(result.path, 'utf8').trim().split('\n');
    expect(written).toHaveLength(1);
    const record = JSON.parse(written[0]);
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.file).toBe('a.md');
    expect(record.category).toBe('commit');
    expect(record.occurrences).toBe(4);
  });

  it('appends without overwriting existing lines', () => {
    appendAuditEntry({ file: 'one.md' }, { repoRoot: tmpRoot });
    appendAuditEntry({ file: 'two.md' }, { repoRoot: tmpRoot });
    const fullPath = path.join(tmpRoot, DEFAULT_AUDIT_LOG_PATH);
    const lines = fs.readFileSync(fullPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).file).toBe('one.md');
    expect(JSON.parse(lines[1]).file).toBe('two.md');
  });

  it('returns ok:false on write failure (parent path is a file, not a directory)', () => {
    const blockingFile = path.join(tmpRoot, 'blocking-file');
    fs.writeFileSync(blockingFile, 'I am a file, not a directory');
    const result = appendAuditEntry(
      { file: 'a.md' },
      { logPath: path.join(blockingFile, 'audit.jsonl') }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
