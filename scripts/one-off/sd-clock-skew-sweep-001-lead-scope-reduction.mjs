#!/usr/bin/env node
// LEAD scope reduction (Q8 deletion audit), applied AFTER VALIDATION sub-agent evidence
// surfaced a live file-ownership collision: SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 (status
// active, phase EXEC, session 961a30d3, filed the same day) plans its own new job on
// .github/workflows/unit-tier-clock-skew.yml -- the exact file piece (b) would edit. CLAUDE_LEAD.md
// ("SDs touching same files should NOT run in parallel") governs this directly. Piece (b) (the
// workflow-file JSON-reporter addition + a triggered measurement run) is deferred to a follow-up
// ticket, filed once the quarantine SD's own workflow edit lands; pieces (c) and (d), which touch
// no shared file, ship in THIS SD.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const { data: existing, error: readErr } = await supabase
  .from('strategic_directives_v2').select('metadata, scope, success_criteria').eq('sd_key', SD_KEY).single();
if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }

const scope = `${existing.scope} LEAD SCOPE REDUCTION (2026-09-13, VALIDATION sub-agent evidence da990b0f): piece `
  + `(b) -- the .github/workflows/unit-tier-clock-skew.yml JSON-reporter addition and its triggered `
  + `measurement run -- is DEFERRED to a named follow-up ticket. SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 `
  + `(status active, phase EXEC, session 961a30d3, filed the same day) independently plans its own new job `
  + `on that SAME workflow file, and any duration piece (b) measured before that SD lands goes stale the `
  + `moment it does. CLAUDE_LEAD.md's "SDs touching same files should NOT run in parallel" governs directly. `
  + `This SD ships pieces (c) and (d) only, which touch no file the quarantine SD owns.`;

const success_criteria = [
  { criterion: 'Piece (c): the clock-skew sweep runs at an absolute TEST_CLOCK_PIN_ISO pin (+45d-class instant AND an instant inside the 22:00-06:00 ET quiet window), not just the existing offset pin', measure: 'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js (the real filename -- corrected from the ticket text) passes new pin-mode test cases at both instants' },
  { criterion: 'Piece (d): a --diff-mode wall-clock-test-lint.mjs flags time-sensitive test files missing a fake-clock token', measure: '0 new violations against the current, MEASURED baseline (11 files via --all census against 4173 test files, not the ticket-estimated 13); the tool\'s own test suite pins this count' },
  { criterion: 'Piece (b) is explicitly deferred, not silently dropped', measure: 'This scope field names the successor ticket condition (after SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 lands its own unit-tier-clock-skew.yml edit) and the reason (live file-ownership collision)' },
];

const metadata = {
  ...(existing.metadata || {}),
  scope_reduction_note: 'piece (b) deferred to a follow-up ticket due to a verified live collision with SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 on .github/workflows/unit-tier-clock-skew.yml (VALIDATION evidence da990b0f, 2026-09-13)',
  deferred_pieces: [
    { piece: 'b', reason: 'live file-ownership collision with SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 (active/EXEC, session 961a30d3) on .github/workflows/unit-tier-clock-skew.yml', blocked_by_sd_key: 'SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001' },
  ],
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2').update({ scope, success_criteria, metadata }).eq('sd_key', SD_KEY);
if (writeErr) { console.error('WRITE_FAILED', writeErr); process.exit(1); }
console.log('LEAD scope reduction recorded for', SD_KEY, '-- piece (b) deferred, (c)/(d) remain in scope.');
