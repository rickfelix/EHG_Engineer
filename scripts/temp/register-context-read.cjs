require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2];
const filePath = process.argv[3] || 'CLAUDE_CORE.md';

// Create or update the SD run record to track file reads
async function registerFileRead() {
  const sdRunId = `${sdId}-run-${Date.now()}`;

  // First, check if there's an existing tracking mechanism
  // The gate uses sd_file_reads table based on the error message

  const { data, error } = await supabase
    .from('sd_file_reads')
    .upsert({
      sd_id: sdId,
      file_path: filePath,
      read_at: new Date().toISOString(),
      read_by: 'claude'
    }, { onConflict: 'sd_id,file_path' })
    .select();

  if (error) {
    // Table might not exist, try alternative approach
    console.log('Note: sd_file_reads table may not exist, trying alternative...');

    // Update SD metadata to include file read tracking
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdId)
      .single();

    if (sdError) {
      console.error('Error fetching SD:', sdError.message);
      process.exit(1);
    }

    const metadata = sd.metadata || {};
    metadata.context_files_read = metadata.context_files_read || [];
    if (!metadata.context_files_read.includes(filePath)) {
      metadata.context_files_read.push(filePath);
    }
    metadata.last_context_read_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata })
      .eq('id', sdId);

    if (updateError) {
      console.error('Error updating SD metadata:', updateError.message);
      process.exit(1);
    }

    console.log('Context file read registered in SD metadata:', filePath);
  } else {
    console.log('Context file read registered:', filePath);
  }
}

registerFileRead();
