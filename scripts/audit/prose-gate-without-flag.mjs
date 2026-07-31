#!/usr/bin/env node
/**
 * QF-20260728-894 — find open SDs that declare a chairman gate in PROSE while no
 * machine-readable flag holds them, so they sit CLAIMABLE on the belt. Exit 1 on an
 * unconditional offender (CI-gateable). Full rationale: PR #6670.
 *
 * metadata.requires_human_action is the ONLY axis that fences a claim (see
 * lib/fleet/claim-eligibility.cjs). requires_chairman_apply / chairman_gated /
 * gated_ddl measured 0 live rows each — folklore.
 *
 * REPORT-ONLY: it never fences. "the coordinator ... STRUCTURALLY CANNOT GRANT IT"
 * is English, not SQL — auto-fencing that match would strand a legitimate SD.
 */
import { createClient } from '@supabase/supabase-js';

const OPEN = ['draft', 'active', 'in_progress', 'pending_approval', 'ready'];
const FLAG = 'requires_human_action';

// A declared gate. Bare GRANT/REVOKE are deliberately absent — proven noisy in prose.
const GATE = [
  /chairman[- ]gated?\b/i,
  /non-?delegable/i,
  /prod-deploy/i,
  /\b(?:3|three)-factor\b/i,
  /not a worker call/i,
  /ALTER DEFAULT PRIVILEGES/i,
  /\b(?:GRANT|REVOKE)\s+[A-Z_, ]+\s+(?:ON|TO|FROM)\b/, // SQL only: needs an object clause
];

// "May require ... If that means DDL, it is chairman-gated" declares a CONDITIONAL gate.
const CONDITIONAL = /\b(?:if|may|might|should it|in the event)\b[^.]{0,120}$/i;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const { data, error } = await sb
  .from('strategic_directives_v2')
  .select('sd_key,title,description,status,metadata')
  .in('status', OPEN);

// Set exitCode and fall through rather than process.exit() — an abrupt exit while the
// supabase client still holds handles trips a libuv UV_HANDLE_CLOSING assertion on Windows
// and reports a bogus 127, which would make this check unusable as a CI gate.
if (error) {
  console.error('query failed:', error.message);
  process.exitCode = 2;
}

const offenders = [];
for (const row of error ? [] : data) {
  if (row.metadata?.[FLAG] === true) continue; // already fenced
  const text = `${row.title || ''}\n${row.description || ''}`;
  const rx = GATE.find((r) => r.test(text));
  if (!rx) continue;
  const at = text.search(rx);
  const conditional = CONDITIONAL.test(text.slice(Math.max(0, at - 120), at));
  offenders.push({ sd_key: row.sd_key, status: row.status, conditional, phrase: text.match(rx)[0] });
}

if (!error) console.log(`[prose-gate-without-flag] scanned ${data.length} open SDs — ${offenders.length} declare a gate with ${FLAG} unset`);
for (const o of offenders) {
  console.log(`  ${o.conditional ? 'CONDITIONAL' : 'UNCONDITIONAL'} [${o.status}] ${o.sd_key} — matched "${o.phrase}"`);
}

const hard = offenders.filter((o) => !o.conditional);
if (hard.length) {
  console.error(`\n${hard.length} SD(s) declare a gate in prose that nothing enforces. Set metadata.${FLAG}=true (with a _reason and _by stamp) or reword the description.`);
  process.exitCode = 1;
}
