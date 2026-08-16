// SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 TR-3 / US-005.
// Scaffold for the TARGET VENTURE's own Cloudflare Worker build (Vite + wrangler.toml, src/-only).
// This file is NEVER deployed as part of EHG_Engineer — it is emitted by
// scripts/agent-readiness-scaffold-route.mjs into a venture repo's src/ tree, matching the
// sitemap.xml/robots.txt precedent already enforced in lib/eva/bridge/templates/venture-stack-scan.js
// (realIo() at line 99 walks ONLY root/src; a static file outside src/ is invisible to it).
//
// EHG_ENGINEER_SERVICE_URL below must point at the deployed agent-readiness service (this repo),
// which holds the published llm_txt_version row — this route is a thin proxy, not a duplicate store.

export async function onRequestGet(context: { request: Request; env: Record<string, string> }) {
  const ventureUrl = context.env.AGENT_READINESS_VENTURE_URL;
  const serviceUrl = context.env.AGENT_READINESS_SERVICE_URL;

  if (!ventureUrl || !serviceUrl) {
    return new Response('llm.txt route misconfigured: missing AGENT_READINESS_VENTURE_URL or AGENT_READINESS_SERVICE_URL', { status: 500 });
  }

  const upstream = await fetch(`${serviceUrl}/api/agent-readiness/llm-txt/live?venture_url=${encodeURIComponent(ventureUrl)}`);

  if (upstream.status === 404) {
    // AC-005-3: no published version yet — do not serve draft content, do not synthesize a fallback.
    return new Response('', { status: 404 });
  }
  if (!upstream.ok) {
    return new Response('llm.txt temporarily unavailable', { status: 502 });
  }

  const content = await upstream.text();
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' }
  });
}
