import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const lastPasteIso = '2026-09-02T14:26:41.494+00:00';
const r = await emitFeedback({ supabase, title: 'bandwidth-forecast: no new usage paste', description: `no new usage paste since ${lastPasteIso} for the active account 7bc04ab1 (Code Street Labs); projection = INSUFFICIENT DATA (1 paste on file). NOTE: the chairman pasted /usage twice on 2026-09-11 (Deep Soul Sessions ~22:15Z: session 69 / week 54 / Fable 95; Code Street Labs ~22:22Z: 0 / 0 / 0) at the Adam terminal and neither was ledgered at paste time (Adam miss); record-account-capacity.mjs writes only against the ACTIVE account at the current instant, so they cannot be backdated truthfully now — ticketed.`, severity: 'low', category: 'adam_duty_log', source_type: 'manual_feedback', dedup_key: 'bandwidth-forecast-2026-09-11', metadata: { duty: 'bandwidth_forecast', silent: true, last_paste_iso: lastPasteIso, active_account_uuid8: '7bc04ab1', projection: 'INSUFFICIENT_DATA_1_PASTE', unrecorded_pastes: ['deepsoul 2026-09-11T22:15Z', 'csl 2026-09-11T22:22Z'], quiet_hours: true } });
console.log('MARKER', JSON.stringify(r).slice(0, 200));
