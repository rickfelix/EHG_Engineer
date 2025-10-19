const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', 'SD-BOARD-VISUAL-BUILDER-002')
    .single();

  if (sd) {
    console.log(sd.id);
  } else {
    console.error('SD not found');
    process.exit(1);
  }
})();
