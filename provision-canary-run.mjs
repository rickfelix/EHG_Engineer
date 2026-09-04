// One-shot: stand up the canary session so CP3's G1a/U4 legs have a real target.
// Calls the EXPORTED provisionCanary() rather than editing start-cp3-drills.js, so the
// drill entrypoint stays canonical and its evidence remains acceptable.
import { createSupabaseServiceClient } from './lib/supabase-client.js';
import { provisionCanary } from './lib/fleet/canary-provision.js';

const supabase = createSupabaseServiceClient();

console.log('[provision] FLEET_SPAWN_CONTROL_LIVE =', process.env.FLEET_SPAWN_CONTROL_LIVE);
console.log('[provision] FLEET_ACCOUNT_PROFILES_DIR =', process.env.FLEET_ACCOUNT_PROFILES_DIR);
console.log('[provision] starting...');

const result = await provisionCanary({
  supabase,
  live: true,
  logFn: (m) => console.log('   ', m),
});

console.log('\n[provision] RESULT:', JSON.stringify(result, null, 2));

if (result.ok) {
  const { data } = await supabase
    .from('claude_sessions')
    .select('session_id, metadata, heartbeat_at, status')
    .eq('metadata->>account_profile', 'canary');
  console.log('\n[provision] canary sessions now registered:', (data || []).length);
  for (const r of data || []) {
    console.log('   ', String(r.session_id).slice(0, 8),
      '| callsign:', r.metadata?.fleet_identity?.callsign || '-',
      '| profile:', r.metadata?.account_profile,
      '| status:', r.status,
      '| hb:', r.heartbeat_at);
  }
}
