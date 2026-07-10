// QF-20260609-564: sd-start.js queried the non-existent column sd_phase_handoffs.sd_key in two
// places (verifyHandoffIntegrity + the >=3-handoffs PRIOR WORK warning), so both silently died:
// verifyHandoffIntegrity's error path returned valid:true (resume-integrity verification disabled)
// and the "another session built this" warning never fired. The real FK is sd_id (UUID).
// These are static source-pins (verifyHandoffIntegrity is an un-exported internal in a large CLI
// script) — matching the tests/unit/harness/block-claims-cancelled.test.js convention.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(repoRoot, 'scripts/sd-start.js'), 'utf-8');
// SD-ARCH-HOTSPOT-SD-START-001 FR-3: verifyHandoffIntegrity relocated to the shared
// gate module — the QF-20260609-564 sd_id-keying invariant is pinned there now.
const gateSrc = fs.readFileSync(path.join(repoRoot, 'lib/claim/gates/handoff-integrity.cjs'), 'utf-8');

describe('QF-20260609-564: sd-start.js handoff queries use sd_id, not sd_key', () => {
  it('verifyHandoffIntegrity (relocated shared gate) filters sd_phase_handoffs by sd_id, and the sd-start wrapper delegates to it', () => {
    const start = gateSrc.indexOf('async function verifyHandoffIntegrity');
    expect(start).toBeGreaterThan(0);
    const fnBlock = gateSrc.slice(start, start + 1200);
    // The integrity query must filter by sd_id...
    expect(fnBlock).toMatch(/\.eq\(['"]sd_id['"],\s*sdUuid\)/);
    // ...and must NOT reference the non-existent sd_key column anywhere in the function.
    expect(fnBlock).not.toMatch(/sd_key/);
    // sd-start delegates (keeps the loud warning surface via onWarn → console.warn).
    const wrapper = src.indexOf('function verifyHandoffIntegrity(sdUuid)');
    expect(wrapper).toBeGreaterThan(0);
    expect(src.slice(wrapper, wrapper + 400)).toMatch(/verifyHandoffIntegrityGate\(supabase,\s*sdUuid/);
  });

  it('the PRIOR WORK (>=3 handoffs) warning filters sd_phase_handoffs by sd_id', () => {
    const idx = src.indexOf('PRIOR WORK WARNING');
    expect(idx).toBeGreaterThan(0);
    // Look at the query just above the warning text.
    const block = src.slice(idx - 400, idx);
    expect(block).toMatch(/\.from\(['"]sd_phase_handoffs['"]\)/);
    expect(block).toMatch(/\.eq\(['"]sd_id['"],\s*sd\.id\)/);
    expect(block).not.toMatch(/\.eq\(['"]sd_key['"]/);
  });

  it('no sd_phase_handoffs query in sd-start.js filters by sd_key (dead-column regression guard)', () => {
    // Pair every sd_phase_handoffs .from(...) ... .eq('sd_key', ...) would be a regression.
    // Simplest robust check: the file must not contain a .eq('sd_key' immediately associated
    // with handoff queries. Since sd-start.js only ever queries sd_phase_handoffs by sd_id now,
    // assert the dead pattern is absent entirely for this column on that table.
    const deadPattern = /sd_phase_handoffs[\s\S]{0,200}?\.eq\(['"]sd_key['"]/;
    expect(src).not.toMatch(deadPattern);
    expect(gateSrc).not.toMatch(deadPattern); // and not reintroduced in the relocated gate
  });

  it('verifyHandoffIntegrity surfaces a query error instead of silently swallowing it (onWarn → console.warn in the CLI)', () => {
    // The relocated gate reports through onWarn on its error branch…
    const start = gateSrc.indexOf('async function verifyHandoffIntegrity');
    const fnBlock = gateSrc.slice(start, start + 1600);
    expect(fnBlock).toMatch(/if \(error\) \{[\s\S]*?onWarn\(/);
    // …and the sd-start wrapper wires onWarn to a loud console.warn.
    const wrapper = src.indexOf('function verifyHandoffIntegrity(sdUuid)');
    expect(src.slice(wrapper, wrapper + 400)).toMatch(/onWarn:.*console\.warn/);
  });
});
