// Stamps encoded_ref / encoded_at / marker_text for the four rulings in PR #8114.
// RUN ONLY FROM A WORKTREE SITTING AT MERGED MAIN. markRatificationEncoded resolves repoRoot
// module-relative, so running it from a lagging shared root fails every mark spuriously
// (8 of 9 failed that way on 2026-09-03; 9 of 9 passed from a worktree copy at merged main).
// repoRoot is passed EXPLICITLY here rather than relying on the default, so the trap cannot fire
// silently — and the script REFUSES if the working tree is behind origin/main.
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
import { createClient } from '@supabase/supabase-js';
import { markRatificationEncoded } from '../../lib/chairman/ratification-writer.mjs';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const repoRoot = process.cwd();

// --- GUARD 1: this tree must be AT merged main, not behind it ---
execSync('git fetch origin main --quiet', { cwd: repoRoot });
const behind = execSync('git rev-list --count HEAD..origin/main', { cwd: repoRoot }).toString().trim();
console.log(`working tree is ${behind} commit(s) behind origin/main`);
if (behind !== '0') { console.log('REFUSING: run this from a worktree AT merged main. A lagging tree fails every mark spuriously.'); process.exit(1); }

// --- GUARD 2: the manifest must exist and be the one just generated ---
const manifestPath = path.join(repoRoot, 'claude-generation-manifest.json');
if (!fs.existsSync(manifestPath)) { console.log('REFUSING: no claude-generation-manifest.json'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestHash = manifest.db_snapshot_hash || manifest.dbSnapshotHash || manifest.snapshot_hash;
if (typeof manifestHash !== 'string' || !manifestHash.length) { console.log('REFUSING: manifest hash not found. keys:', Object.keys(manifest).join(', ')); process.exit(1); }
console.log('manifest hash:', manifestHash);

const M = {
  '49656c8c': 'FOUNDATION CAPA PROGRAMME: corrective AND preventive, every workstream carrying a CI-asserted exit predicate (ratification 49656c8c)',
  '1726f11d': 'LEDGER REPAIR PRECEDES THE FRESHNESS LEVER (ratification 1726f11d)',
  '767b288f': 'ALTIFYAI STAGE 23: BUILD THE ELEVEN SURFACES, and the fourteen-journey set is the specification of record (ratification 767b288f)',
  '584e3e0e': 'HEADROOM LAUNCH CONDITION REPEALED (ratification 584e3e0e, repealing f7303528)',
};
// Section cited per ruling. The writer verifies ONE site; every target is checked independently
// below so a pass here is never mistaken for all-targets coverage (audit C7: 28 of 40 verified at
// one site only). That single-site limitation is what W2's marker-verification child exists to fix.
const SECTION = { '49656c8c': '601', '1726f11d': '601', '767b288f': '601', '584e3e0e': '611' };
const TARGET_FILES = {
  '49656c8c': ['CLAUDE_ADAM.md', 'CLAUDE_SOLOMON.md', 'CLAUDE_COORDINATOR.md'],
  '1726f11d': ['CLAUDE_ADAM.md', 'CLAUDE_SOLOMON.md'],
  '767b288f': ['CLAUDE_ADAM.md', 'CLAUDE_SOLOMON.md', 'CLAUDE_COORDINATOR.md'],
  '584e3e0e': ['CLAUDE_ADAM.md', 'CLAUDE_SOLOMON.md'],
};

// --- GUARD 3: every declared target must carry the marker in the file ON THIS TREE ---
let allPresent = true;
console.log('\nPER-TARGET MARKER CHECK (all targets, not just the cited section):');
for (const [rid, marker] of Object.entries(M)) {
  for (const f of TARGET_FILES[rid]) {
    const p = path.join(repoRoot, f);
    const ok = fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(marker);
    if (!ok) allPresent = false;
    console.log(`  ${rid}  ${f.padEnd(24)} ${ok ? 'PRESENT' : 'MISSING'}`);
  }
}
if (!allPresent) { console.log('\nREFUSING: a declared target is missing its marker. Not stamping a partial encode.'); process.exit(1); }

const { data: before } = await s.from('chairman_ratifications').select('id,encoded_at,encoded_ref,marker_text');
const idFor = (short) => (before || []).find((r) => String(r.id).startsWith(short))?.id;

if (!APPLY) { console.log('\nDRY RUN — all guards passed. Pass --apply to stamp.'); process.exit(0); }

console.log('');
for (const [short, marker] of Object.entries(M)) {
  const full = idFor(short);
  if (!full) { console.log(`${short}: ratification row NOT FOUND`); continue; }
  try {
    await markRatificationEncoded(s, full, { sectionId: SECTION[short], manifestHash, markerText: marker, repoRoot });
    console.log(`${short}: STAMPED (section ${SECTION[short]})`);
  } catch (e) {
    console.log(`${short}: FAILED — ${e.message}`);
  }
}

const { data: after } = await s.from('chairman_ratifications').select('id,encoded_at,encoded_ref,marker_text').in('id', Object.keys(M).map(idFor).filter(Boolean));
console.log('\nREADBACK:');
for (const r of after || []) {
  console.log(`  ${String(r.id).slice(0, 8)}  encoded_at=${r.encoded_at ? 'SET' : 'NULL'}  encoded_ref=${r.encoded_ref ? 'SET' : 'NULL'}  marker_text=${r.marker_text ? 'SET' : 'NULL'}`);
}
