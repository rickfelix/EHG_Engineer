// SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001 -- create + complete sd_scope_deliverables rows,
// one per user story, with real evidence from the actual EXEC-phase code changes.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001';

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) { console.error('SD_LOOKUP_FAILED', sdErr.message); process.exit(1); }

const { data: stories, error: storiesErr } = await supabase.from('user_stories').select('id, story_key, title').eq('sd_id', sd.id);
if (storiesErr) { console.error('STORIES_LOOKUP_FAILED', storiesErr.message); process.exit(1); }

const now = new Date().toISOString();

const DELIVERABLE_MAP = {
  'US-001': {
    deliverable_type: 'other',
    deliverable_name: 'lib/venture-acquisition/dns-wiring.js',
    description: 'createDnsAdapter() token resolution: CLOUDFLARE_DNS_API_TOKEN preferred, CLOUDFLARE_REGISTRAR_API_TOKEN fallback',
    evidence: 'dns-wiring.js:46 changed to `env.CLOUDFLARE_DNS_API_TOKEN || env.CLOUDFLARE_REGISTRAR_API_TOKEN`. Verified live: DNS token returns 200 on listZones/listRecords; registrar token now fails all Cloudflare endpoints (403/401). Unit tests TS-1/TS-2/G1/G2/G3 (tests/unit/venture-acquisition/dns-wiring-e2e.test.js) assert the exact Authorization header value per token-presence combination. 18/18 tests green.',
  },
  'US-002': {
    deliverable_type: 'test',
    deliverable_name: 'tests/unit/venture-acquisition/dns-wiring-e2e.test.js',
    description: 'Extend the source secret-scan to guard CLOUDFLARE_DNS_API_TOKEN with a quote-anchored regex',
    evidence: 'Secret-scan test (lines ~223-233) now loops over both CLOUDFLARE_REGISTRAR_API_TOKEN and CLOUDFLARE_DNS_API_TOKEN with a quote-anchored regex (TOKEN_NAME\\s*=\\s*[\'"`]) so a `||` fallback expression never false-positives. New dual-token redaction test added confirming CLOUDFLARE_DNS_API_TOKEN never leaks into a thrown error message. 18/18 tests green.',
  },
  'US-003': {
    deliverable_type: 'documentation',
    deliverable_name: 'lib/venture-acquisition/registrar-adapter.js',
    description: 'Correct the stale CREDENTIAL CONTRACT doc comment claiming the registrar token carries DNS-edit scope',
    evidence: 'registrar-adapter.js doc comment (lines 14-27) corrected: no longer claims the registrar token carries working DNS-edit scope; documents the measured 2026-09-12 finding and points to dns-wiring.js for the DNS-scoped token. Doc-only change, no behavior change (confirmed via Explore sub-agent: this file never calls /zones or /dns_records).',
  },
  'US-004': {
    deliverable_type: 'other',
    deliverable_name: 'lib/venture-acquisition/dns-wiring.js (createZone fence)',
    description: 'Fence the createZone/zone.create permission gap so it is not silently masked',
    evidence: 'wireDomainDns() (dns-wiring.js:92-98) carries a KNOWN LIMITATION comment documenting that both tokens 403 on createZone (missing zone.create permission) and that this requires an ops action, not a code fix. TS-6 (rewritten per TESTING sub-agent finding) asserts the createZone throw propagates uncaught through wireDomainDns rather than being silently downgraded to blocked_on_credentials.',
  },
  'US-005': {
    deliverable_type: 'documentation',
    deliverable_name: 'lib/venture-acquisition/dns-wiring.js (doc comment)',
    description: "Document the DNS-token-preferred/registrar-fallback credential contract in dns-wiring.js's own module doc comment",
    evidence: "dns-wiring.js module doc comment (lines 20-33) rewritten to document the new CREDENTIAL CONTRACT (DNS token preferred, registrar token fallback) and the KNOWN LIMITATION (createZone permission gap), replacing the stale 'Same credential contract as the registrar adapter' line.",
  },
};

function keyFor(storyKey) {
  const m = storyKey.match(/US-\d+/);
  return m ? m[0] : null;
}

for (const story of stories) {
  const key = keyFor(story.story_key);
  const spec = DELIVERABLE_MAP[key];
  if (!spec) { console.error('NO_MAPPING_FOR', story.story_key); process.exit(1); }
  const { error } = await supabase.from('sd_scope_deliverables').insert({
    sd_id: sd.id,
    deliverable_type: spec.deliverable_type,
    deliverable_name: spec.deliverable_name,
    description: spec.description,
    priority: 'required',
    completion_status: 'completed',
    completion_evidence: spec.evidence,
    verified_by: 'EXEC',
    verified_at: now,
    completed_at: now,
    user_story_id: story.id,
    created_by: 'Bravo worker session 45924f8d',
  });
  if (error) { console.error('INSERT_FAILED', story.story_key, error.message); process.exit(1); }
  console.log('Completed deliverable for', story.story_key, '->', spec.deliverable_name);
}
