import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id, implementation_approach')
  .eq('directive_id', 'SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const parsed = typeof prd.implementation_approach === 'string'
  ? JSON.parse(prd.implementation_approach)
  : prd.implementation_approach;

const p4 = parsed.phases.find((p) => p.phase === 'P4');
p4.description = p4.description.replace(
  /BOTH chairman-facing surfaces \(the SMS via scripts\/drive-report-sms\.mjs, and the morning brief via scripts\/cron\/chairman-morning-review-sweep\.mjs\)/,
  'BOTH chairman-facing surfaces (the exec-summary email via scripts/adam-exec-summary.mjs, and the '
    + 'morning brief via scripts/cron/chairman-morning-review-sweep.mjs) -- EXEC-phase code read '
    + 'confirmed the real second consumer is adam-exec-summary.mjs, not scripts/drive-report-sms.mjs '
    + '(which only supplies formatBody/formatDriveBreakdown, the formatter composeDriveLine calls '
    + 'into -- it is not itself a composeDriveLine consumer)'
);
p4.acceptance = p4.acceptance.map((a) => (
  a.startsWith('Both scripts/drive-report-sms.mjs')
    ? 'Both scripts/adam-exec-summary.mjs and scripts/cron/chairman-morning-review-sweep.mjs are '
      + 'verified (via their existing call sites into composeDriveLine()) to receive the new clause '
      + 'without needing their own separate code changes'
    : a
));

const overview = parsed.overview;
const newImplementationApproach = JSON.stringify({ overview, phases: parsed.phases });

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ implementation_approach: newImplementationApproach })
  .eq('id', prd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('P4 consumer citation corrected: scripts/drive-report-sms.mjs -> scripts/adam-exec-summary.mjs (the real composeDriveLine consumer, confirmed by EXEC-phase code read).');
