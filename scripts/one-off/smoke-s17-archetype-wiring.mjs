import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateArchetypeVariants } from '../../lib/eva/stage-17/archetype-generator.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ventureId = '510177ba-435f-4dd7-bfa5-6154cc8cf54b';

const { data: wireframeArt } = await supabase
  .from('venture_artifacts')
  .select('artifact_data')
  .eq('venture_id', ventureId)
  .eq('artifact_type', 'wireframe_screens')
  .eq('is_current', true)
  .maybeSingle();

const screen = wireframeArt.artifact_data.screens.find(
  (s) => (s.name ?? s.screen_name ?? s.title) === 'Landing Page'
);
console.log('Screen found:', !!screen);

const artifactIds = await generateArchetypeVariants(
  ventureId,
  'Landing Page',
  'landing-smoke-test-0',
  supabase,
  { screen }
);
console.log('SMOKE_TEST_ARTIFACT_IDS=' + JSON.stringify(artifactIds));
