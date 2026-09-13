import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001';

const CORRECTED_TEXT = `lib/venture-acquisition/dns-wiring.js's createDnsAdapter() (line 34) reads env.CLOUDFLARE_REGISTRAR_API_TOKEN for all Cloudflare zone/DNS operations (listZones, createZone, listRecords, createRecord).

CORRECTED SYMPTOM (measured 2026-09-12 by a VALIDATION sub-agent re-probe; the original finding's stated symptom was imprecise): the failure is NOT a basic /zones lookup -- GET /zones?name=... succeeds (HTTP 200) with BOTH CLOUDFLARE_REGISTRAR_API_TOKEN and CLOUDFLARE_DNS_API_TOKEN. The actual failure is one level deeper, at the DNS-records endpoints: GET/POST /zones/{id}/dns_records returns HTTP 403 "Authentication error" (code 10000) with CLOUDFLARE_REGISTRAR_API_TOKEN, but succeeds/is authorized with CLOUDFLARE_DNS_API_TOKEN. createDnsAdapter()'s listRecords/createRecord calls -- the ones wireDomainDns() actually needs to write the apex+www CNAME records -- are the ones that are broken, not listZones.

SEPARATE, UNFIXABLE-BY-TOKEN-SWAP GAP (also measured): NEITHER token can createZone (POST /zones) -- both return 403 "Requires permission com.cloudflare.api.account.zone.create". The fix below only unblocks the EXISTING-ZONE path (e.g. altifyai.app, whose zone already exists); a brand-new venture domain needing a fresh zone still hits blocked_on_credentials at createZone. This is an ops/permissions gap (needs a zone.create grant on whichever token), explicitly OUT OF SCOPE for this SD's code change and must be fenced in the PRD, not silently left to fail.

FIX: createDnsAdapter() reads env.CLOUDFLARE_DNS_API_TOKEN preferentially, falling back to env.CLOUDFLARE_REGISTRAR_API_TOKEN when the DNS-specific token is absent (preserves the existing test at tests/unit/venture-acquisition/dns-wiring-e2e.test.js:120, which asserts non-null using ONLY the registrar token, and preserves null-when-neither-set plan-mode semantics). registrar-adapter.js is confirmed OUT OF SCOPE -- it never calls /zones or /dns_records, only registrar/domain-search endpoints; its own doc comment (line 15) claiming the registrar token carries "DNS edit scopes" is measurably stale and gets a doc-only correction.

## Rationale
Created from feedback item. Source: manual_feedback

## Scope
Same as description above.`;

const SUCCESS_CRITERIA = [
  {
    criterion: 'createDnsAdapter() prefers CLOUDFLARE_DNS_API_TOKEN over CLOUDFLARE_REGISTRAR_API_TOKEN for its Authorization header, falling back to the registrar token only when the DNS token is absent',
    measure: 'unit test asserts the exact Authorization header value used per token-presence combination (both set -> DNS token; registrar-only -> registrar token; neither -> adapter is null), not just non-null',
  },
  {
    criterion: 'listRecords/createRecord (the calls wireDomainDns() actually needs) succeed against a real zone using the corrected token resolution',
    measure: "live re-probe of GET /zones/{id}/dns_records using the adapter's resolved token returns 200/authorized (not the pre-fix 403 code 10000), reproducing the same probe methodology used to find the defect",
  },
  {
    criterion: 'The unfixable createZone permission gap is explicitly fenced in code/PRD, not silently swallowed',
    measure: 'PRD documents that new-domain zone creation remains blocked_on_credentials pending an ops zone.create grant; existing wireDomainDns() blocked_on_credentials behavior for that path is unchanged and covered by a test asserting it still surfaces',
  },
];

const SMOKE_TEST_STEPS = [
  {
    step_number: 1,
    instruction: 'With both CLOUDFLARE_DNS_API_TOKEN and CLOUDFLARE_REGISTRAR_API_TOKEN set, call createDnsAdapter(process.env).listRecords(existingZoneId) against the altifyai.app zone',
    expected_outcome: "Returns the zone's DNS records (HTTP 200) -- confirms the adapter now authenticates DNS-record calls that previously 403'd with the registrar-only token",
  },
  {
    step_number: 2,
    instruction: 'Unset CLOUDFLARE_DNS_API_TOKEN, keep only CLOUDFLARE_REGISTRAR_API_TOKEN, call createDnsAdapter(process.env)',
    expected_outcome: "Adapter still activates (non-null), preserving TR-5's original single-credential fallback design and the existing dns-wiring-e2e.test.js:120 contract",
  },
  {
    step_number: 3,
    instruction: 'Unset both tokens, call createDnsAdapter(process.env)',
    expected_outcome: 'Returns null (plan mode) -- unchanged existing behavior',
  },
];

const KEY_CHANGES = [
  {
    change: 'createDnsAdapter() in lib/venture-acquisition/dns-wiring.js resolves its Cloudflare API token as CLOUDFLARE_DNS_API_TOKEN with a fallback to CLOUDFLARE_REGISTRAR_API_TOKEN, instead of reading only the latter',
    impact: 'Unblocks listRecords/createRecord (the DNS-record calls wireDomainDns() needs) for zones that already exist -- CLOUDFLARE_REGISTRAR_API_TOKEN measurably 403s (code 10000 Authentication error) on those endpoints while CLOUDFLARE_DNS_API_TOKEN succeeds. Does NOT fix createZone (403 on both tokens, a separate zone.create permission gap requiring an ops action, explicitly fenced as out of scope).',
  },
  {
    change: "Extend the source secret-scan unit test (dns-wiring-e2e.test.js) to also guard a literal CLOUDFLARE_DNS_API_TOKEN assignment, and correct registrar-adapter.js's stale doc comment claiming the registrar token carries DNS-edit scope",
    impact: 'Keeps existing secret-hygiene test coverage complete for the new token; keeps in-code documentation accurate now that DNS-edit access is confirmed to live on a different credential',
  },
];

const MECHANISM_VERIFICATION = {
  verified_by: 'Bravo worker session 45924f8d (validation-agent sub-agent re-probe, corrected from an initial imprecise measurement)',
  verified_at: 'lib/venture-acquisition/dns-wiring.js:34',
  claim: 'createDnsAdapter() reads env.CLOUDFLARE_REGISTRAR_API_TOKEN, which measurably 403s "Authentication error" (code 10000) on GET/POST .../dns_records (the calls wireDomainDns() needs), while a live re-probe confirms env.CLOUDFLARE_DNS_API_TOKEN succeeds on the same calls. GET /zones itself succeeds with either token -- that call is NOT the discriminator, contrary to this SD\'s original description (corrected in this same update). Neither token can createZone (403, missing zone.create permission) -- a separate, unfixable-by-token-swap gap fenced out of scope.',
};

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ_FAILED', readErr.message); process.exit(1); }

const existingVerifications = Array.isArray(current.metadata?.mechanism_verifications) ? current.metadata.mechanism_verifications : [];
const newMetadata = {
  ...current.metadata,
  mechanism_verifications: [...existingVerifications, MECHANISM_VERIFICATION],
};

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    description: CORRECTED_TEXT,
    scope: CORRECTED_TEXT,
    success_criteria: SUCCESS_CRITERIA,
    smoke_test_steps: SMOKE_TEST_STEPS,
    key_changes: KEY_CHANGES,
    metadata: newMetadata,
  })
  .eq('sd_key', SD_KEY);
if (error) { console.error('UPDATE_FAILED', error.message); process.exit(1); }
console.log('SD updated: description/scope/success_criteria/smoke_test_steps/key_changes/mechanism_verifications');
