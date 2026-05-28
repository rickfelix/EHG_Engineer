import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const content = `## Venture Lifecycle Pipeline

When a LEAD worker engages a **venture** SD (venture_id set) or an **orchestrator** SD (sd_type=orchestrator), the work sits inside a canonical pipeline. Know where you are in it before acting.

### Canonical sequence
1. **/brainstorm** — 6-seat board (CSO/CRO/CTO/CISO/COO/CFO) debates the venture.
2. **L2 vision doc** — brainstorm-to-vision writes a rich L2 vision (extracted_dimensions, sections).
3. **Chairman approval** — chairman sets chairman_approved=true on the L2 vision.
4. **archplan upsert** — architecture plan generated/upserted for the approved vision.
5. **Vision-approval cascade** — approval auto-cascades to create the orchestrator SD (SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001, #4028).
6. **Orchestrator + children** — lifecycle-sd-bridge generates the orchestrator and child SDs. This is GATED: \`assertVentureVisionReady()\` (lib/eva/lifecycle-sd-bridge.js) throws **VENTURE_L2_VISION_MISSING** or **VENTURE_L2_VISION_DRAFT_SEED** with the exact \`/brainstorm\` unblock command if no chairman-approved L2 exists. The bridge CANNOT generate children before the brainstorm. (SD-LEO-INFRA-UNIFY-VENTURE-NON-001 Child C, #3993.)
7. **LEAD → PLAN → EXEC** — normal LEO workflow per child.

### LEAD is a CIRCUIT-BREAKER (not a redesign layer)
At a venture orchestrator, LEAD **APPROVES** the decomposition or **BUBBLES UP** to the chairman. LEAD does **NOT** redesign the decomposition itself. If the children look wrong, the fix is upstream (re-brainstorm / re-vision), not LEAD re-authoring the plan. (CronGenius pilot P-FAIL-2: LEAD-as-remediation-layer was caught by the chairman.)

### Per-child cancellation evaluation
When a venture orchestrator's children are misaligned, evaluate **each child individually** — do NOT cancel all children uniformly. (CronGenius pilot P-FAIL-4: all 5 children were cancelled uniformly, but only A/B were truly misaligned; C/D/E were adjustable.) Cancel with a \`cancellation_reason\` and, when superseded, set \`metadata.superseded_by_sd\`.

> Source: CronGenius first-venture pilot (P-FAIL-2/3/4). Behavioral enforcement already shipped: bridge refusal gate (#3993) + vision-to-orchestrator cascade (#4028). This section closes the discoverability gap (SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001).`;

await sb.from('leo_protocol_sections').delete().eq('section_type', 'venture_lifecycle_pipeline');
const { data, error } = await sb.from('leo_protocol_sections').insert({
  protocol_id: 'leo-v4-3-3-ui-parity',
  section_type: 'venture_lifecycle_pipeline',
  title: 'Venture Lifecycle Pipeline',
  content,
  order_index: 32,
  context_tier: 'REFERENCE',
  priority: 'STANDARD',
  target_file: 'CLAUDE_LEAD.md',
  metadata: { sd_key: 'SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001', pilot_findings: ['P-FAIL-2', 'P-FAIL-3', 'P-FAIL-4'] },
}).select('id').single();
if (error) { console.error('INSERT ERR:', error.message); process.exit(1); }
const { data: check } = await sb.from('leo_protocol_sections').select('content').eq('id', data.id).single();
console.log('Inserted id:', data.id);
console.log('HAS assertVentureVisionReady:', check.content.includes('assertVentureVisionReady'));
console.log('HAS backtick:', check.content.includes(String.fromCharCode(96)));
console.log('LEN:', check.content.length);
