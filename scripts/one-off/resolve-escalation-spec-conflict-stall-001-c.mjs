import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADDENDUM = `

### Escalation-duty spec check (SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C, resolving an RCA 9a02a76d open question)

RCA 9a02a76d flagged this section's coordinator escalation chain ("COORDINATOR -> ADAM ->
CHAIRMAN", above) as possibly contradicted by \`docs/protocol/crew-comms-routing-protocol.md\`
Rule 5's escalation ladder ("Adam -> Solomon -> Chairman"). Investigated: **not a conflict --
two different ladders for two different triggers, both funneling to the chairman only through
Adam.**

- **This section's ladder** (Coordinator -> Adam -> Chairman) is the coordinator's own
  blocked-claim-resolution path: an operational matter the coordinator cannot itself resolve,
  escalated through Adam.
- **Rule 5's ladder** (Adam -> Solomon -> Chairman) is Adam's escalation path when a matter
  needs deep-reasoning consult before reaching the chairman -- it adds the Solomon hop
  specifically for issues in Solomon's remit (hard analysis/verdicts), which a coordinator
  blocked-claim is not.

Both are consistent with Rule 5's own stated invariant that "the chairman receives only the
funnel (through Adam), never the raw N^2 chatter between the other roles" and this section's
"the chairman is the last resort, reached only through Adam." No amendment needed to either
document; this note closes the RCA's open question with a documented "no conflict" verdict
rather than leaving it unresolved.`;

const SECTION_ID = 632;

async function main() {
  const { data: section, error } = await supabase.from('leo_protocol_sections').select('id, content').eq('id', SECTION_ID).single();
  if (error) throw error;
  if (section.content.includes('Escalation-duty spec check')) {
    console.log('Addendum already present on section', SECTION_ID, '-- no-op');
    return;
  }
  const { error: updErr } = await supabase.from('leo_protocol_sections')
    .update({ content: section.content + ADDENDUM })
    .eq('id', SECTION_ID);
  if (updErr) throw updErr;
  console.log('OK appended escalation-duty spec-check resolution to leo_protocol_sections id=' + SECTION_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
