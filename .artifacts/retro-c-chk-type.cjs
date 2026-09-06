require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('retrospectives').select('id,sd_id,retro_type,status,quality_score,created_at').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').eq('retro_type','SD_COMPLETION').gt('created_at','2026-09-06T12:07:53Z').then(r=>console.log(JSON.stringify(r.data)));
