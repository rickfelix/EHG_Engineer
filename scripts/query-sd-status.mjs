import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

async function queryStatus() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Query SD status
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress_percentage')
    .eq('id', 'SD-VWC-PHASE1-001')
    .single();

  if (sdError) {
    console.log('⚠️  SD not found in Engineer database');
    console.log('Note: Implementation done in ehg app, tracked via PRD');
  } else {
    console.log('SD Status:', JSON.stringify(sd, null, 2));
  }

  // Query handoffs
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, created_at, status')
    .eq('sd_id', 'SD-VWC-PHASE1-001')
    .order('created_at', { ascending: false });

  console.log('\nRecent Handoffs:');
  if (handoffs && handoffs.length > 0) {
    handoffs.forEach(h => {
      console.log(`  ${h.from_phase} → ${h.to_phase}: ${h.status} (${new Date(h.created_at).toLocaleString()})`);
    });
  } else {
    console.log('  No handoffs found');
  }

  // Query PRD status
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, status, title')
    .eq('id', 'PRD-VWC-PHASE1-001')
    .single();

  console.log('\nPRD Status:', prd ? JSON.stringify(prd, null, 2) : 'Not found');

  // Query user stories completion
  const { data: stories } = await supabase
    .from('user_stories')
    .select('status, story_points')
    .eq('prd_id', 'PRD-VWC-PHASE1-001');

  const completed = stories?.filter(s => s.status === 'completed').length || 0;
  const total = stories?.length || 0;
  const completedPoints = stories?.filter(s => s.status === 'completed').reduce((sum, s) => sum + (s.story_points || 0), 0) || 0;
  const totalPoints = stories?.reduce((sum, s) => sum + (s.story_points || 0), 0) || 0;

  console.log(`\nUser Stories: ${completed}/${total} (${Math.round(completed/total*100)}%) | Points: ${completedPoints}/${totalPoints} (${Math.round(completedPoints/totalPoints*100)}%)`);
}

queryStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
