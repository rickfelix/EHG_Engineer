import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { validatePRDHeuristic } from '../modules/prd-quality-validation.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prd } = await supabase.from('product_requirements_v2').select('*').eq('id', 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A').maybeSingle();
const result = validatePRDHeuristic(prd, { sdType: 'bugfix' });
console.log('issues:', JSON.stringify(result.issues, null, 2));
console.log('score:', result.score);
