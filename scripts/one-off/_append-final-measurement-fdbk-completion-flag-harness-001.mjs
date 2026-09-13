import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001';

const APPENDUM = `

FINAL RE-MEASUREMENT (2026-09-12T23:51:15Z, EXEC phase, Bravo worker session 45924f8d, 3x-repeated + comprehensive): CLOUDFLARE_REGISTRAR_API_TOKEN's exact failure signature was observed to CHANGE during this same session -- the PLAN-phase VALIDATION sub-agent's probe (~23:0xZ) reported GET /zones succeeding (200) with the registrar token, with the failure isolated to /dns_records (403 code 10000). A repeated, comprehensive re-probe at 23:51:15Z (after .env's own mtime of 23:12:52Z, suggesting the credential was rotated/invalidated mid-session by an unrelated process on this shared machine) now shows the registrar token failing EVERYWHERE: GET /zones -> 403 code 9109 "Invalid access token"; GET /dns_records -> 401 code 10000 "Authentication error"; GET /user/tokens/verify -> 401 code 1000 "Invalid API Token". CLOUDFLARE_DNS_API_TOKEN remains consistently fully functional across every probe (listZones 200, listRecords 200) throughout the session. This does not change the fix: it depends only on "DNS token consistently works, registrar token is unreliable" -- true under every measurement taken this session, regardless of the registrar token's exact instantaneous error code. Included for transparency (an instrument that lies is worth naming), not because it changes the implementation.`;

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('description')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ_FAILED', readErr.message); process.exit(1); }

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ description: current.description + APPENDUM })
  .eq('sd_key', SD_KEY);
if (error) { console.error('UPDATE_FAILED', error.message); process.exit(1); }
console.log('SD description appended with final re-measurement note.');
