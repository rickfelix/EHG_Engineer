import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('eva_sync_state')
  .select('id, source_type, source_identifier, updated_at, source_metadata')
  .eq('source_type', 'youtube')
  .eq('source_identifier', 'youtube_oauth')
  .maybeSingle();

if (error) {
  console.log('ERROR', error.message);
} else if (!data) {
  console.log('NO_ROW');
} else {
  const meta = data.source_metadata || {};
  const hasEncrypted = Boolean(meta.encrypted_tokens?.encrypted);
  const hasPlaintextKeys = Object.keys(meta).some(k => /token|refresh/i.test(k) && k !== 'encrypted_tokens');
  console.log(JSON.stringify({
    id: data.id,
    updated_at: data.updated_at,
    has_encrypted_tokens: hasEncrypted,
    top_level_metadata_keys: Object.keys(meta),
    has_suspicious_plaintext_keys: hasPlaintextKeys,
  }, null, 2));
}
