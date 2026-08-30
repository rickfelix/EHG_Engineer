// QF-20260830-156: a rebind never reaching a frozen seat's screen because the per-session
// identity file is only ever written by that seat's OWN hook. This writer (assign-fleet-
// identities.cjs) must refresh the file itself, in the SAME action as the DB write, for both
// paths that change a worker's identity: the rebroadcast/rename loop AND first assignment.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mod = require('../../scripts/assign-fleet-identities.cjs');
const { identityFilePath, buildIdentityFileContent, IDENTITY_DIR } = mod;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOD_PATH = path.resolve(__dirname, '../../scripts/assign-fleet-identities.cjs');

describe('QF-20260830-156: identityFilePath', () => {
  it('matches the reader/hook-writer convention exactly (fleet-identity-<sessionId>.json under .claude/)', () => {
    expect(identityFilePath('78a073be-f6e0-45bc-8ae5-db640a41b0fc'))
      .toBe(path.join(IDENTITY_DIR, 'fleet-identity-78a073be-f6e0-45bc-8ae5-db640a41b0fc.json'));
    expect(IDENTITY_DIR).toBe(path.resolve(path.dirname(MOD_PATH), '..', '.claude'));
  });
});

describe('QF-20260830-156: buildIdentityFileContent', () => {
  it('shapes the same keys the hook writer and statusline reader already agree on', () => {
    const content = buildIdentityFileContent({ callsign: 'Hotel-3', color: 'blue', display_name: 'Hotel-3 | idle', tier_rank: 2 });
    expect(content.callsign).toBe('Hotel-3');
    expect(content.color).toBe('blue');
    expect(content.display_name).toBe('Hotel-3 | idle');
    expect(content.tier_rank).toBe(2);
    expect(typeof content.assigned_at).toBe('string');
  });

  it('defaults tier_rank to null rather than undefined (JSON-safe, matches the hook writer)', () => {
    const content = buildIdentityFileContent({ callsign: 'Bravo', color: 'green', display_name: 'Bravo | idle' });
    expect(content.tier_rank).toBeNull();
  });
});

describe('QF-20260830-156: SAME-ACTION wiring — both identity-changing paths call writeIdentityFile', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(MOD_PATH, 'utf8');

  it('the rebroadcast/rename loop refreshes the file immediately after its DB metadata update', () => {
    const rebroadcastBlock = src.slice(src.indexOf("if (identityNeedsRebroadcast(w, expectedIdentity))"), src.indexOf('Send updated identity message'));
    expect(rebroadcastBlock).toMatch(/\.update\(\{ metadata \}\)/);
    expect(rebroadcastBlock).toMatch(/writeIdentityFile\(w\.session_id, \{ \.\.\.expectedIdentity, tier_rank: tierRankOf\(w\) \}\)/);
    // the write call must come AFTER the DB update, not before
    expect(rebroadcastBlock.indexOf('.update({ metadata })')).toBeLessThan(rebroadcastBlock.indexOf('writeIdentityFile('));
  });

  it('the first-assignment loop refreshes the file immediately after its DB metadata update', () => {
    const assignBlock = src.slice(src.indexOf('Store identity in session metadata'), src.indexOf('Send SET_IDENTITY coordination message'));
    expect(assignBlock).toMatch(/Failed to update metadata/);
    expect(assignBlock).toMatch(/writeIdentityFile\(worker\.session_id, \{ callsign, color, display_name: displayName, tier_rank: tierRankOf\(worker\) \}\)/);
    expect(assignBlock.indexOf('Failed to update metadata')).toBeLessThan(assignBlock.indexOf('writeIdentityFile('));
  });
});
