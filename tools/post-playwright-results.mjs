#!/usr/bin/env node
// Maps Playwright JSON report -> /api/stories/verify calls (one POST per story_key)
// Usage:
//  node tools/post-playwright-results.mjs \
//    --report artifacts/playwright-report.json \
//    --coverage coverage/coverage-summary.json \
//    --api https://staging.ehg_eng/api/stories/verify \
//    --token "$SERVICE_TOKEN" \
//    --build "$BUILD_ID" --env staging [--dry-run]

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => {
  if (!a.startsWith("--")) return [];
  const k = a.slice(2);
  const v = (arr[i + 1] && !arr[i + 1].startsWith("--")) ? arr[i + 1] : true;
  return [k, v];
}).filter(Boolean));

const REPORT = args.report || "artifacts/playwright-report.json";
const COVER = args.coverage || "";
const API = args.api || process.env.STORY_VERIFY_API;
const TOKEN = args.token || process.env.SERVICE_TOKEN;
const BUILD_ID = args.build || process.env.BUILD_ID || `local-${Date.now()}`;
const ENV = args.env || process.env.DEPLOY_ENV || "staging";
const DRY = !!args["dry-run"];

if (!API || !TOKEN) {
  console.error("ERROR: Missing --api or --token (or STORY_VERIFY_API/SERVICE_TOKEN env).");
  process.exit(2);
}
if (!fs.existsSync(REPORT)) {
  console.error(`ERROR: report file not found: ${REPORT}`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));

// Optional overall coverage %
let coveragePct = undefined;
if (COVER && fs.existsSync(COVER)) {
  try {
    const cov = JSON.parse(fs.readFileSync(COVER, "utf8"));
    // Try Istanbul summary first; fallback to overall lines.pct
    coveragePct = cov?.total?.lines?.pct ?? cov?.total?.statements?.pct ?? undefined;
  } catch { /* ignore */ }
}

const STORY_RE = /(SD-[A-Z0-9\-]+:US-[a-f0-9]{8})/i;

// Extract stories from Playwright JSON (robust, recursive)
function* iterTests(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) yield* iterTests(n); return; }
  if (node.tests && Array.isArray(node.tests)) {
    for (const t of node.tests) yield t;
  }
  if (node.specs && Array.isArray(node.specs)) {
    for (const s of node.specs) if (s.tests) for (const t of s.tests) yield t;
  }
  if (node.suites && Array.isArray(node.suites)) {
    for (const s of node.suites) yield* iterTests(s);
  }
}

// Map status
const mapStatus = (s) => s === "passed" ? "passing" : (s === "failed" ? "failing" : "not_run");

// Get story key from annotations or title path
function extractStoryKey(test) {
  // 1) annotations: [{ type:"story", description:"SD-...:US-..." }]
  if (Array.isArray(test.annotations)) {
    const a = test.annotations.find(x => (x.type || "").toLowerCase() === "story" && x.description);
    if (a?.description && STORY_RE.test(a.description)) return a.description.match(STORY_RE)[1];
  }
  // 2) title or fullTitle
  const candidates = [test.title, test.titlePath?.join(" / "), test.location?.file].filter(Boolean);
  for (const c of candidates) {
    if (typeof c === "string" && STORY_RE.test(c)) return c.match(STORY_RE)[1];
  }
  return null;
}

// Aggregate by story_key
const perStory = new Map(); // story_key -> {status, artifacts[]}
for (const t of iterTests(report)) {
  const storyKey = extractStoryKey(t);
  if (!storyKey) continue;
  const testStatus = mapStatus(t.outcome || t.status || "not_run");

  const entry = perStory.get(storyKey) || { status: "not_run", artifacts: [] };
  // Escalate status: failing dominates > passing > not_run
  const rank = { failing: 2, passing: 1, not_run: 0 };
  entry.status = rank[testStatus] > rank[entry.status] ? testStatus : entry.status;

  // Pull artifact paths if present
  const results = Array.isArray(t.results) ? t.results : [];
  for (const r of results) {
    const atts = Array.isArray(r.attachments) ? r.attachments : [];
    for (const a of atts) {
      if (a?.path) entry.artifacts.push(a.path);
    }
  }
  perStory.set(storyKey, entry);
}

// POST each story (one-by-one; statuses may differ)
async function postOne(storyKey, payload) {
  const body = {
    story_keys: [storyKey],
    test_run_id: payload.test_run_id,
    build_id: payload.build_id,
    status: payload.status,
    coverage_pct: payload.coverage_pct,
    artifacts: payload.artifacts.slice(0, 10) // cap
  };
  if (DRY) {
    console.log("[DRY-RUN]", storyKey, JSON.stringify(body));
    return { ok: true, dry: true };
  }
  let attempt = 0;
  const max = 3;
  while (attempt < max) {
    attempt++;
    const res = await fetch(API, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) return { ok: true };
    const txt = await res.text();
    console.warn(`POST attempt ${attempt} failed for ${storyKey}: ${res.status} ${txt}`);
    await new Promise(r => setTimeout(r, 500 * attempt)); // backoff
  }
  return { ok: false };
}

const testRunId = `tr-${BUILD_ID}`;
const results = [];
for (const [storyKey, v] of perStory.entries()) {
  results.push(await postOne(storyKey, {
    test_run_id: testRunId,
    build_id: BUILD_ID,
    status: v.status,
    coverage_pct: coveragePct,
    artifacts: v.artifacts
  }));
}

const ok = results.every(r => r.ok);
console.log(`Posted ${results.length} story updates → ${ok ? "OK" : "SOME FAILURES"}`);
process.exit(ok ? 0 : 1);