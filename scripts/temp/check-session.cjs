require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveOwnSession } = require('../../lib/resolve-own-session.cjs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

resolveOwnSession(supabase, { select: 'metadata', warnOnFallback: false })
  .then(function(result) {
    var data = result.data;
    if (data && data.metadata && typeof data.metadata.auto_proceed !== 'undefined') {
      console.log('SESSION_AUTO_PROCEED=' + data.metadata.auto_proceed);
      console.log('SESSION_CHAIN_ORCHESTRATORS=' + (data.metadata.chain_orchestrators || false));
    } else {
      console.log('SESSION_NEW=true');
    }
  });
