import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { autoValidateStories } from '../scripts/modules/handoff/executors/exec-to-plan/test-evidence.js';
const supabase = createSupabaseServiceClient();
const sdId = '346eaa99-8d8a-4233-b593-50b21149c958';
await autoValidateStories(supabase, sdId);
const { data: us } = await supabase.from('user_stories').select('story_key,status,validation_status').eq('sd_id', sdId);
console.log('STORIES', JSON.stringify(us));
