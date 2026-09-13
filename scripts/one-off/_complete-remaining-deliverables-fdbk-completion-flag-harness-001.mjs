import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const now = new Date().toISOString();

const UPDATES = [
  {
    id: 'c54a936e-47a7-403b-b274-92ef602e3ce3',
    evidence: 'Covered by lib/venture-acquisition/dns-wiring.js\'s token-resolution fix + TS-1 unit test (tests/unit/venture-acquisition/dns-wiring-e2e.test.js), which asserts listRecords() authenticates with CLOUDFLARE_DNS_API_TOKEN via the resolved Authorization header. Live re-probe (2026-09-12T23:51:15Z) confirms GET /zones/{id}/dns_records returns 200 with the DNS token against the real altifyai.app zone.',
  },
  {
    id: '6094f10d-3a8a-48a4-b373-1726a088957d',
    evidence: 'Fenced via a KNOWN LIMITATION comment at wireDomainDns()\'s createZone call site (dns-wiring.js:92-98) and the module-level doc comment, plus TS-6 (rewritten per PLAN-phase TESTING sub-agent finding) asserting the createZone 403 throw propagates uncaught through wireDomainDns rather than being silently downgraded to blocked_on_credentials.',
  },
  {
    id: 'f889722d-83f2-4245-ae58-16b80c91bfbd',
    evidence: 'lib/venture-acquisition/registrar-adapter.js\'s CREDENTIAL CONTRACT comment (lines 14-27) corrected to no longer claim the registrar token carries working DNS-edit scope; dns-wiring.js\'s own module doc comment (lines 20-33) rewritten to document the DNS-token-preferred/registrar-fallback contract and the createZone KNOWN LIMITATION.',
  },
];

for (const u of UPDATES) {
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({
      completion_status: 'completed',
      completion_evidence: u.evidence,
      verified_by: 'EXEC',
      verified_at: now,
      completed_at: now,
    })
    .eq('id', u.id);
  if (error) { console.error('UPDATE_FAILED', u.id, error.message); process.exit(1); }
  console.log('Completed', u.id);
}
