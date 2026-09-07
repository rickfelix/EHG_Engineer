import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G';
const VERIFIER = 'Alpha-5 worker session bc70bff7';

// GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982): every file+function mechanism claim in the SD
// spine needs a named verifier with a real file:line citation, not an endorsement. Each entry
// below was personally opened and confirmed (directly by this session's Read/Grep, or by the
// Explore sub-agent pass whose evidence row is e95179c6-e678-4d78-bc0e-72f31e2254ee) -- no
// fabricated line numbers; two files (adam-register.cjs, coordinator-startup-check.mjs) were
// re-grepped directly in this script's authoring session specifically because the sub-agent
// passes had only named them without a line, per this gate's own "do not invent a plausible
// file:line" design constraint.
const MECHANISM_VERIFICATIONS = [
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/modules/handoff/gates/core-protocol-gate.js:392',
    claim: 'recordCompactionEvent() (lines 392-429) stamps protocolGate.lastCompactionAt and clears fileReads, but has ZERO callers anywhere in scripts/, lib/, .claude/ -- confirmed dead code, not the live enforcement path.',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/hooks/protocol-compaction-hook.cjs:57',
    claim: 'The peer recordCompaction() (lines 57-109) is reachable ONLY from .claude/commands/context-compact.md:73, the MANUAL /context-compact slash command -- not from the real wired PreCompact hook.',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/hooks/protocol-file-tracker.cjs:29',
    claim: 'Explicit in-file comment "CRITICAL: Must stay in sync with core-protocol-gate.js requirements" at line 29, immediately preceding the PROTOCOL_FILES array (line 33) which already lists every role-contract file (CLAUDE_ADAM.md, CLAUDE_SOLOMON.md, CLAUDE_COORDINATOR*.md and companions) -- this is the wired PostToolUse hook identified as the no-new-machinery enforcement host.',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/adam-register.cjs:345',
    claim: 'checkContractRead(projectDir) reads status.lastReadAt into contract_last_read_at (line 378) -- the tracker Adam\'s register script actually consults, distinct from protocolGate.fileReads.',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/coordinator-startup-check.mjs:642',
    claim: 'Header comment "Deliberately mirrors adam-register.cjs checkContractRead rather than inventing a shape" (line 642), same contract_last_read_at field populated at line 688 -- confirms the coordinator uses the identical tracker to Adam, not protocolGate.fileReads.',
  },
];

async function main() {
  const { data: current, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  if (Array.isArray(current.metadata?.mechanism_verifications) && current.metadata.mechanism_verifications.length > 0) {
    console.log('Already applied. No-op.');
    process.exit(0);
  }

  const newMetadata = { ...current.metadata, mechanism_verifications: MECHANISM_VERIFICATIONS };

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata })
    .eq('sd_key', SD_KEY);
  if (updateError) { console.error('UPDATE FAILED:', updateError.message); process.exit(1); }

  const { data: verify } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  console.log('mechanism_verifications count:', verify.metadata?.mechanism_verifications?.length);
}

if (isMainModule(import.meta.url)) {
  main();
}
