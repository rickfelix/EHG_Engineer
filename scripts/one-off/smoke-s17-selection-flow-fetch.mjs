import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { submitPass1Selection } from '../../lib/eva/stage-17/selection-flow.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ventureId = '510177ba-435f-4dd7-bfa5-6154cc8cf54b';
const selectedIds = ['27f4ce96-b147-44c2-98d3-dc3bf7ccdb37', '7f8020a9-890d-436e-9518-a404d555a63a'];

const result = await submitPass1Selection(ventureId, 'landing-smoke-test-0', selectedIds, supabase, { platform: 'mobile' });
console.log('SELECTION_FLOW_RESOLVED_OK=true');
console.log('REFINED_VARIANT_COUNT=' + (result?.artifactIds?.length ?? result?.length ?? 'unknown'));
