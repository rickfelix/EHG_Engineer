#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001';

// GATE_MECHANISM_CLAIM_VERIFIER: the SD's risks[] assert a mechanism about
// lib/eva/stage-execution-worker.js (dual provisioning entry points, split applications
// registry) with no named verifier -- endorsement of the peer research swarm's claims is not
// evidence. A fresh VALIDATION sub-agent run (sub_agent_execution_results id
// 492c0cf2-7cd1-4970-b785-9c655bd57508, verdict=PASS, verification_type=
// independent_mechanism_claim_verification, endorsement_of_peer_research=false) independently
// confirmed both claims (claims_confirmed=2) and corrected one citation (citations_corrected=1)
// -- re-verified directly here with live grep against the exact same commit
// (7cd316dcf2e155b09e1a5247c861732d8d65afbe) the VALIDATION row evaluated.

const mechanism_verifications = [
  {
    verified_by: 'Golf (worker session 9a78de7f), grep-confirmed against commit 7cd316dcf2e155b09e1a5247c861732d8d65afbe; independently corroborated by VALIDATION sub-agent evidence row 492c0cf2-7cd1-4970-b785-9c655bd57508 (verdict=PASS, verification_type=independent_mechanism_claim_verification)',
    verified_at: 'lib/eva/bridge/venture-provisioner.js:832',
    claim: 'provisionVenture() is defined once, at this line.',
    evidence: 'export async function provisionVenture(ventureId, options = {}) { at line 832 (grep-confirmed).',
  },
  {
    verified_by: 'Golf (worker session 9a78de7f), grep-confirmed against commit 7cd316dcf2e155b09e1a5247c861732d8d65afbe; independently corroborated by VALIDATION sub-agent evidence row 492c0cf2-7cd1-4970-b785-9c655bd57508',
    verified_at: 'lib/eva/stage-execution-worker.js:1963',
    claim: 'provisionVenture()\'s sole production call site -- corrects the original LEAD-phase citation guess of line 1922/3861, both wrong.',
    evidence: 'const result = await provisionVenture(ventureId, { at line 1963 (grep-confirmed).',
  },
  {
    verified_by: 'Golf (worker session 9a78de7f), grep-confirmed against commit 7cd316dcf2e155b09e1a5247c861732d8d65afbe; independently corroborated by VALIDATION sub-agent evidence row 492c0cf2-7cd1-4970-b785-9c655bd57508 (measured_counts.scaffold_writing_paths_found=3)',
    verified_at: 'lib/eva/stage-execution-worker.js:702',
    claim: 'A standalone self-heal call to ensureLeoBridgeScaffold() bypasses provisionVenture() by design -- a third, narrower re-entry point FR-2\'s build-gate must also account for.',
    evidence: 'const { ensureLeoBridgeScaffold } = await import(\'./bridge/venture-provisioner.js\'); await ensureLeoBridgeScaffold(ventureId, repoPath, { at lines 702-703 (grep-confirmed).',
  },
  {
    verified_by: 'Golf (worker session 9a78de7f), grep-confirmed against commit 7cd316dcf2e155b09e1a5247c861732d8d65afbe; independently corroborated by VALIDATION sub-agent evidence row 492c0cf2-7cd1-4970-b785-9c655bd57508',
    verified_at: 'server/routes/github-repo.js:62',
    claim: 'buildModel=seeded_repo ventures bypass provisionVenture() entirely via a raw `gh repo create` shell-out in a mounted Express route -- FR-2 must hook this path too, not just provisionVenture().',
    evidence: '`gh repo create rickfelix/${repoName} --public --clone=false ...` at line 62, inside createAndSeedHandler (defined line 25, mounted as POST /create-and-seed at line 143) (grep-confirmed).',
  },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMeta = {
  ...(sd.metadata || {}),
  mechanism_verifications,
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMeta })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('mechanism_verifications written for SD', sd.id, '(' + mechanism_verifications.length + ' entries)');
