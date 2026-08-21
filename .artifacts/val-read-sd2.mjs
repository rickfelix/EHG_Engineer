import { createSupabaseClient } from '../lib/supabase-client.js';
const s = createSupabaseClient ? createSupabaseClient() : null;
console.log('client?', !!s);
