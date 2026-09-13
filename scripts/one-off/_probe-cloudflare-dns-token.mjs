// SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001 -- TS-4/AC#2 manual live-evidence probe.
//
// NOT wired into CI (per PLAN-phase TESTING sub-agent finding): the unit test tier
// deliberately does not load .env, and the integration/db tier's db-tier-gate.js refuses
// fetch/net to any non-loopback host. A live Cloudflare API call can only run as a standalone
// opt-in script like this one -- run manually, evidence captured to stdout for the SD record.
import 'dotenv/config';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DOMAIN = process.argv[2] || 'altifyai.app';

async function probe(label, token) {
  if (!token) { console.log(`${label}: SKIPPED (no token in env)`); return; }
  const zonesRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(DOMAIN)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const zonesJson = await zonesRes.json();
  const zoneId = zonesJson?.result?.[0]?.id;
  console.log(`${label} listZones: HTTP ${zonesRes.status} success=${zonesJson.success} zoneId=${zoneId || 'none'}`);
  if (!zoneId) return;
  const recordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const recordsJson = await recordsRes.json();
  console.log(`${label} listRecords: HTTP ${recordsRes.status} success=${recordsJson.success} count=${recordsJson?.result?.length ?? 'n/a'} errors=${JSON.stringify(recordsJson.errors || [])}`);
}

console.log(`Probing domain=${DOMAIN} account=${ACCOUNT_ID ? ACCOUNT_ID.slice(0, 6) + '...' : 'MISSING'} at ${new Date().toISOString()}`);
await probe('REGISTRAR_TOKEN', process.env.CLOUDFLARE_REGISTRAR_API_TOKEN);
await probe('DNS_TOKEN', process.env.CLOUDFLARE_DNS_API_TOKEN);
