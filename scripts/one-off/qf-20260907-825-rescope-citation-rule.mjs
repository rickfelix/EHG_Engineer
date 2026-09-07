#!/usr/bin/env node
/**
 * QF-20260907-825: add a documentation-only "hard rule" to leo_protocol_sections id=601
 * (Adam contract, section 5r "SD sourcing & creation — hard rules") requiring a re-scope
 * proposal to quote the defining artifact's FR text + exit predicate before routing to the
 * gate owner. No new gate, no approval step, no change to who may propose -- a citation
 * requirement only, per the QF's own "NOT PROPOSED" scope note.
 *
 * DB-first: this is the durable write. Regenerate CLAUDE_ADAM.md afterward:
 *   node scripts/generate-claude-md-from-db.js --only CLAUDE_ADAM.md
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const ANCHOR = 'dispatching. Then parallelize the (a)s across the whole weak layer, sized to idle capacity.';

const NEW_BULLET = `

- **RE-SCOPE PROPOSALS CITE THE DEFINING ARTIFACT.** A proposal to carve a requirement out from
  behind a gate dependency (e.g. "FR-N is dependency-free") must quote the FR text AND its exit
  predicate as the basis for that claim, before being routed to the gate owner — an exit predicate
  is part of a requirement's own definition, and a dependency claim that has not read it has not
  read the requirement. Citation requirement only: no new approval step, no blocked routing, no
  change to who may propose. (QF-20260907-825: two seats independently forwarded an FR-1 scope
  carve for SD-LEO-INFRA-E2E-REAL-TEST-001 without either citing FR-1's exit predicate, which
  re-coupled it to a pending decision; a third seat caught it only by reading the source directly.)`;

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: row, error: fetchError } = await supabase
    .from('leo_protocol_sections')
    .select('content, metadata')
    .eq('id', 601)
    .single();
  if (fetchError) throw fetchError;

  if (row.content.includes('RE-SCOPE PROPOSALS CITE THE DEFINING ARTIFACT')) {
    console.log('Already applied -- no-op.');
    return;
  }
  if (!row.content.includes(ANCHOR)) {
    throw new Error('Anchor text not found in section 601 content -- section has drifted since this script was written. Re-check before editing.');
  }

  const newContent = row.content.replace(ANCHOR, ANCHOR + NEW_BULLET);

  const amendmentKeys = Object.keys(row.metadata || {}).filter((k) => /^amendment_\d+$/.test(k));
  const nextN = amendmentKeys.length + 1;
  const newMetadata = {
    ...row.metadata,
    [`amendment_${nextN}`]: {
      at: new Date().toISOString(),
      by: 'worker:dbb159b6-22d9-4670-aab8-e15cfe321a23',
      change: 'QF-20260907-825: added a 5r hard-rule requiring re-scope proposals to cite the defining FR text + exit predicate before routing to the gate owner. Documentation-only (no new gate, no approval step, no change to who may propose); not a chairman ratification, an Adam-scoped SOP addition per 5r\'s own framing.',
      publication_sequencing: 'DB section is the encode. Regeneration to CLAUDE_ADAM.md via --only CLAUDE_ADAM.md, committed in the same PR as this script.',
    },
  };

  const { error: updateError } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent, metadata: newMetadata })
    .eq('id', 601);
  if (updateError) throw updateError;

  console.log(`Applied. metadata.amendment_${nextN} recorded.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
