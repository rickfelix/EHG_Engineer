import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('id', '2d913732-f5d4-4721-9095-f00b955bd32c')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const metadata = {
  ...sd.metadata,
  fr3_chairman_decision_packet: {
    routed_at: new Date().toISOString(),
    routed_via: 'worker-signal.cjs (type=other)',
    signal_id: '90680ebd-bedd-4f18-ae60-fa6003188cc7',
    pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8256',
    summary: 'leg4 ladder_distance illustrative mapping + 20-row historical back-computation '
      + '(3 TIGHT, 15 non-TIGHT indistinguishable by state, 2 unavailable) routed to the '
      + 'coordinator for chairman decision on whether/how to graduate leg4 earning off '
      + 'binary TIGHT-only. Code ships with the binary rule fully unchanged.',
  },
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('FR-3 chairman decision packet routing recorded in SD metadata.fr3_chairman_decision_packet.');
