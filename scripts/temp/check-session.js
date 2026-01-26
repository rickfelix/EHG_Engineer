require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

supabase.from('claude_sessions')
  .select('metadata')
  .eq('status', 'active')
  .order('heartbeat_at', { ascending: false })
  .limit(1)
  .single()
  .then(function(result) {
    var data = result.data;
    if (data && data.metadata && typeof data.metadata.auto_proceed !== 'undefined') {
      console.log('SESSION_AUTO_PROCEED=' + data.metadata.auto_proceed);
      console.log('SESSION_CHAIN_ORCHESTRATORS=' + (data.metadata.chain_orchestrators || false));
    } else {
      console.log('SESSION_NEW=true');
    }
  });
