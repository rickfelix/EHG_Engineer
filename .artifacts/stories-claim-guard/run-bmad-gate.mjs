import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { validateBMADForPlanToExec } from '../../scripts/modules/bmad-validation.js';
const s = createSupabaseServiceClient();
const r = await validateBMADForPlanToExec('11f9e1ac-a769-47f1-82b4-950a32a0d977', s);
console.log('\n=== BMAD GATE RESULT ===');
console.log('passed:', r.passed, '| score:', r.score);
console.log('stories_context_engineering:', JSON.stringify(r.details?.stories_context_engineering, null, 2));
console.log('issues:', JSON.stringify(r.issues, null, 2));
