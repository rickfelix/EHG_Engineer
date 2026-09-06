import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let { data: qf } = await s.from('quick_fixes').select('id,title,status,description').eq('id', 'QF-20260906-282').maybeSingle();
if (!qf) ({ data: qf } = await s.from('quick_fixes').select('id,title,status,description').ilike('id', '%20260906-282%').maybeSingle());
if (!qf) throw new Error('QF-282 not found');
const note = `

[Adam 2026-09-06 14:2xZ — INHERITED from the Cloudflare AI assistant, relayed by the chairman in-terminal] Direct model run on the AltifyAI account SUCCEEDED: a 64x64 solid-red PNG (12,420 bytes) sent to @cf/llava-hf/llava-1.5-7b-hf with "Describe this image in one sentence." returned HTTP 200, result.description "A red background with a red color that is bright and vibrant.", errors [] . Settles: Workers AI is enabled and billing-accepted on the account; the ai binding on the altifyai Worker is healthy. ELIMINATED: billing/terms not accepted, entitlement, binding misconfig. REMAINING CAUSE SPACE for the ~5-6 s 500 at POST /api/alt-text (lib/alt-text/generate.js AI catch :214): the venture's own call shape — (a) the input encoding it sends (base64 string vs Uint8Array/number[] image bytes; the assistant's working call used raw PNG bytes), (b) payload size (uploaded photos are MB-scale; the working probe was 12 KB — try a downscale before the model call), (c) the exact model id the venture calls vs @cf/llava-hf/llava-1.5-7b-hf. Worker step: reproduce with the venture's exact request against the same model from one-shot-ai-probe.yml once the Deploy token gains Workers AI scope (FR-3 of SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001), or via the assistant's working call shape; then persist the provider message (QF-20260906-986) so the next failure names itself.`;
const { error } = await s.from('quick_fixes').update({ description: (qf.description || '') + note }).eq('id', qf.id);
if (error) throw error;
const { data: rb } = await s.from('quick_fixes').select('description').eq('id', qf.id).single();
console.log(qf.id, qf.status, 'appended', rb.description.includes('llava-1.5-7b-hf'));
