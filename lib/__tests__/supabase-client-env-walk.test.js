// Tests for QF-20260504-755 — supabase-client parent .env walk
// Pre-fix: dotenv.config({path:'.env'}) only checked cwd. Manual `git worktree
// add` (no .env copy) → crash. Post-fix: walks up cwd ancestors to find .env.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CJS_PATH = path.resolve(__dirname, '../supabase-client.cjs').replace(/\\/g, '/');
const ESM_PATH = path.resolve(__dirname, '../supabase-client.js').replace(/\\/g, '/');

function spawnAndProbeEnv(modulePath, cwd, dotenvDir, dotenvContents) {
  const { spawn } = require('node:child_process');
  // Set up: write .env in dotenvDir if provided
  if (dotenvDir && dotenvContents) {
    fs.mkdirSync(dotenvDir, { recursive: true });
    fs.writeFileSync(path.join(dotenvDir, '.env'), dotenvContents);
  }
  const code = `
    require('${modulePath}');
    process.stdout.write(JSON.stringify({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      probe: process.env.QF755_PROBE_KEY || ''
    }), () => process.exit(0));
  `;
  // Strip Supabase URL from env so the test reflects what the file's own
  // dotenv-walking found (otherwise we just see the parent process's value).
  const cleanEnv = { ...process.env };
  delete cleanEnv.NEXT_PUBLIC_SUPABASE_URL;
  delete cleanEnv.SUPABASE_URL;
  delete cleanEnv.QF755_PROBE_KEY;
  const probe = spawn('node', ['-e', code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd,
    env: cleanEnv
  });
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

describe('QF-755 ENV-WALK-1 (cjs): walks up to find ancestor .env', () => {
  it('loads .env from grandparent dir when cwd has none', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qf755-'));
    const childDir = path.join(root, 'sub', 'sub-sub');
    fs.mkdirSync(childDir, { recursive: true });
    const r = await spawnAndProbeEnv(CJS_PATH, childDir, root, 'QF755_PROBE_KEY=walk-cjs-001\nNEXT_PUBLIC_SUPABASE_URL=https://walked.example.com\n');
    const lastJsonLine = r.stdout.split('\n').reverse().find(l => l.trim().startsWith('{') && l.includes('"probe"')) || r.stdout;
    const parsed = JSON.parse(lastJsonLine);
    expect(parsed.probe).toBe('walk-cjs-001');
    expect(parsed.url).toBe('https://walked.example.com');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('QF-755 ENV-WALK-2 (cjs): cwd .env wins over ancestor', () => {
  it('prefers nearest .env (cwd) over ancestor .env', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qf755-'));
    const childDir = path.join(root, 'sub');
    fs.mkdirSync(childDir, { recursive: true });
    fs.writeFileSync(path.join(root, '.env'), 'QF755_PROBE_KEY=ancestor-loses\n');
    fs.writeFileSync(path.join(childDir, '.env'), 'QF755_PROBE_KEY=cwd-wins\n');
    const r = await spawnAndProbeEnv(CJS_PATH, childDir, null, null);
    const lastJsonLine = r.stdout.split('\n').reverse().find(l => l.trim().startsWith('{') && l.includes('"probe"')) || r.stdout;
    const parsed = JSON.parse(lastJsonLine);
    expect(parsed.probe).toBe('cwd-wins');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('QF-755 ENV-WALK-3 (cjs): no .env anywhere → no crash', () => {
  it('does not throw when no .env exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qf755-'));
    const r = await spawnAndProbeEnv(CJS_PATH, root, null, null);
    expect(r.code).toBe(0);
    const lastJsonLine = r.stdout.split('\n').reverse().find(l => l.trim().startsWith('{') && l.includes('"probe"')) || r.stdout;
    const parsed = JSON.parse(lastJsonLine);
    expect(parsed.probe).toBe('');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('QF-755 ENV-WALK-4 (esm): walks up to find ancestor .env', () => {
  it('ESM build also walks ancestors', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qf755-'));
    const childDir = path.join(root, 'sub', 'sub-sub');
    fs.mkdirSync(childDir, { recursive: true });
    const r = await spawnAndProbeEnv(ESM_PATH, childDir, root, 'QF755_PROBE_KEY=walk-esm-001\n');
    const lastJsonLine = r.stdout.split('\n').reverse().find(l => l.trim().startsWith('{') && l.includes('"probe"')) || r.stdout;
    const parsed = JSON.parse(lastJsonLine);
    expect(parsed.probe).toBe('walk-esm-001');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
