/**
 * Tests for Atomic File Write Utility
 * SD-LEO-INFRA-PROTOCOL-FILE-STATE-001
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeFileAtomic, writeFileAtomicAsync } from './atomic-write.js';

const TEST_DIR = path.join(os.tmpdir(), 'atomic-write-test-' + Date.now());

// Setup/cleanup
function ensureTestDir() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

afterEach(() => {
  // Clean up test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('writeFileAtomic', () => {
  it('should write a new file', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'new-file.txt');
    writeFileAtomic(filePath, 'hello world');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('should overwrite an existing file', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'existing.txt');
    fs.writeFileSync(filePath, 'old content');
    writeFileAtomic(filePath, 'new content');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  it('should not leave temp files on success', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'clean.txt');
    writeFileAtomic(filePath, 'content');
    const files = fs.readdirSync(TEST_DIR);
    expect(files).toEqual(['clean.txt']);
  });

  it('should handle Buffer content', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'buffer.bin');
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xFF]);
    writeFileAtomic(filePath, buf);
    expect(fs.readFileSync(filePath)).toEqual(buf);
  });

  it('should handle empty content', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'empty.txt');
    writeFileAtomic(filePath, '');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
  });

  it('should handle large content', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'large.txt');
    const content = 'x'.repeat(1024 * 1024); // 1MB
    writeFileAtomic(filePath, content);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('should handle unicode content', () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'unicode.txt');
    const content = '## LEO Protocol 🚀\n日本語テスト\nÜmlàuts';
    writeFileAtomic(filePath, content);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('should throw if directory does not exist', () => {
    const filePath = path.join(TEST_DIR, 'nonexistent', 'sub', 'file.txt');
    expect(() => writeFileAtomic(filePath, 'content')).toThrow();
  });

  it('should clean up temp file on write failure', () => {
    ensureTestDir();
    // Make the directory read-only to simulate write failure
    // (This test is platform-specific and may skip on Windows)
    if (process.platform === 'win32') {
      return; // Skip on Windows - can't make dirs truly read-only easily
    }
    const readOnlyDir = path.join(TEST_DIR, 'readonly');
    fs.mkdirSync(readOnlyDir);
    fs.chmodSync(readOnlyDir, 0o444);
    try {
      expect(() => writeFileAtomic(path.join(readOnlyDir, 'file.txt'), 'content')).toThrow();
      const files = fs.readdirSync(readOnlyDir);
      expect(files).toEqual([]);
    } finally {
      fs.chmodSync(readOnlyDir, 0o755);
    }
  });
});

describe('writeFileAtomicAsync', () => {
  it('should write a new file', async () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'async-new.txt');
    await writeFileAtomicAsync(filePath, 'async hello');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('async hello');
  });

  it('should overwrite an existing file', async () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'async-existing.txt');
    fs.writeFileSync(filePath, 'old');
    await writeFileAtomicAsync(filePath, 'new');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new');
  });

  it('should handle Buffer content', async () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'async-buffer.bin');
    const buf = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
    await writeFileAtomicAsync(filePath, buf);
    expect(fs.readFileSync(filePath)).toEqual(buf);
  });

  it('should not leave temp files on success', async () => {
    ensureTestDir();
    const filePath = path.join(TEST_DIR, 'async-clean.txt');
    await writeFileAtomicAsync(filePath, 'content');
    const files = fs.readdirSync(TEST_DIR);
    expect(files).toEqual(['async-clean.txt']);
  });
});
