// QF-20260509-CANCEL-SD: source-level guards for the canonical cancel-sd.js
// script. Closes feedback 5b5b959e (no canonical cancel-sd.js exists; direct
// UPDATE leaves claiming_session_id populated).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(repoRoot, 'scripts/cancel-sd.js');

describe('QF-20260509-CANCEL-SD: cancel-sd.js canonical script', () => {
  it('script exists at scripts/cancel-sd.js', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('script enforces required --reason flag (rejects empty)', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    expect(src).toMatch(/Missing or empty --reason/);
    expect(src).toMatch(/required\)/);
  });

  it('script accepts both sd_key and UUID identifiers', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    // UUID detection regex
    expect(src).toMatch(/\^\[0-9a-f\]\{8\}-/);
    // resolveSD must .or both sd_key and id
    expect(src).toMatch(/sd_key\.eq\.\${input}/);
    expect(src).toMatch(/id\.eq\.\${input}/);
  });

  it('atomic UPDATE clears claiming_session_id + is_working_on=false', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    expect(src).toMatch(/claiming_session_id:\s*null/);
    expect(src).toMatch(/is_working_on:\s*false/);
    expect(src).toMatch(/status:\s*'cancelled'/);
    expect(src).toMatch(/current_phase:\s*'CANCELLED'/);
  });

  it('cancellation_reason is required (not optional)', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    // The reason field must be present in the updates object
    expect(src).toMatch(/cancellation_reason:\s*reason/);
  });

  it('releases claude_sessions row scoped to the SD-being-cancelled', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    expect(src).toMatch(/from\(['"]claude_sessions['"]\)/);
    expect(src).toMatch(/status:\s*'released'/);
    // Must filter by both session_id AND sd_key (not blind release)
    expect(src).toMatch(/\.eq\(['"]session_id['"],\s*claimedSessionId\)/);
    expect(src).toMatch(/\.eq\(['"]sd_key['"],\s*sd\.sd_key\)/);
  });

  it('refuses to cancel completed SDs', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    expect(src).toMatch(/Cannot cancel completed SD/);
    expect(src).toMatch(/sd\.status === ['"]completed['"]/);
  });

  it('idempotent on already-cancelled SDs (no-op + early return)', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    expect(src).toMatch(/already cancelled/);
    expect(src).toMatch(/sd\.status === ['"]cancelled['"]/);
  });

  it('npm run sd:cancel script entry exists in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
    expect(pkg.scripts['sd:cancel']).toBe('node scripts/cancel-sd.js');
  });

  it('QF-COLDROP regression-pin: updates object does NOT include cancelled_at (column does not exist on strategic_directives_v2)', () => {
    const src = fs.readFileSync(scriptPath, 'utf-8');
    const idx = src.indexOf('const updates = {');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 500);
    expect(block).not.toMatch(/cancelled_at\s*:/);
    expect(block).toMatch(/updated_at\s*:\s*new Date\(\)\.toISOString\(\)/);
  });
});
