#!/usr/bin/env node
// GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982): the spine names files+functions it makes claims
// about; this records WHO read them and WHERE, so the claim is citable, not merely endorsed.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const { data: existing, error: readErr } = await supabase
  .from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }

const mechanism_verifications = [
  { verified_by: 'LEAD (Golf, session 81425e08)', verified_at: 'tests/setup.clock-skew.js:70', note: 'beforeEach reapplies vi.setSystemTime() from TEST_CLOCK_OFFSET_MS every test; the absolute TEST_CLOCK_PIN_ISO pin piece (c) adds sits beside this same hook.' },
  { verified_by: 'LEAD (Golf, session 81425e08)', verified_at: 'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js:36', note: 'runChildVitest spawns a nested vitest process to observe the setup hook from outside; the ticket names this file without its real .spawn. infix, confirmed as the only matching file.' },
  { verified_by: 'LEAD (Golf, session 81425e08)', verified_at: 'scripts/lint/wall-clock-test-lint.mjs:60', note: 'isViolation() -- built during LEAD Explore; --all census against current main measured 11 pre-existing violations across 4173 test files (not the ticket-estimated 13).' },
  { verified_by: 'LEAD (Golf, session 81425e08)', verified_at: '.github/workflows/unit-tier-clock-skew.yml:68', note: 'the existing vitest run step piece (b) extends with a JSON reporter; workflow_dispatch already exists at line 21, so no new workflow is needed.' },
];

const metadata = { ...(existing.metadata || {}), mechanism_verifications };
const { error: writeErr } = await supabase
  .from('strategic_directives_v2').update({ metadata }).eq('sd_key', SD_KEY);
if (writeErr) { console.error('WRITE_FAILED', writeErr); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY, '(', mechanism_verifications.length, 'entries )');
