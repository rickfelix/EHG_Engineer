// SECURITY sub-agent — EXEC_TO_PLAN adversarial review evidence for
// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B (asset-view-gate hard fence).
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'FAIL',
  confidence: 92,
  summary:
    'Adversarial EXEC-TO-PLAN review of lib/creative/asset-view-gate.js. checkAssetViewAuthorized() (US-001) is genuinely sound — every documented property was probed and holds: the missing-ventureId short-circuit fires before any DB call, is_demo OUT_OF_SCOPE is correctly treated as NOT-authorized, armed:true is a hardcoded literal, the override is namespaced and one-shot, and PostgREST filter injection / type confusion on ventureId is impossible (all metacharacters percent-encoded; any non-uuid yields 22P02 -> reviewError -> fail closed). '
    + 'BUT mintAssetViewUrl() (US-002) contains an UNADDRESSED confused-deputy / IDOR defect that negates this SD\'s own stated invariant: it authorizes a SUBJECT (ventureId) and then signs a RESOURCE (storagePath) that is never bound to it. storagePath is passed to createSignedUrl() with ZERO validation — no venture-prefix check, no traversal rejection, no type check. '
    + 'Empirically demonstrated against the real module (not inferred): ventureId=<venture that cleared S23+S24> + storagePath=<a DIFFERENT venture\'s path> mints a working signed URL for an asset whose own venture provably fails the gate (product_review_not_approved). An HTTP execution trace further shows a "../" storagePath escapes the bucket entirely on the wire. Zero live consumers today, so nothing is exploitable right now — but this module declares itself "the sole sanctioned read/view surface" and instructs all future consumers to trust it, so the first consumer (Child C\'s taste-gate UI, which will naturally take an asset identifier from a request) inherits the hole by construction. Fix is ~6 lines with no schema dependency.',
  findings: [
    {
      id: 'SEC-B1',
      severity: 'high',
      title: 'mintAssetViewUrl does not bind the authorized ventureId to the signed storagePath (confused deputy / cross-venture IDOR)',
      location: 'lib/creative/asset-view-gate.js:112-127 (storagePath flows unvalidated from the param at :112 to createSignedUrl at :122)',
      detail:
        'checkAssetViewAuthorized({supabase, ventureId}) decides authorization for a VENTURE. mintAssetViewUrl then signs whatever storagePath the caller supplies. The two are never cross-checked. '
        + 'lib/creative/asset-storage.js:108 establishes the tenancy layout as `${ventureId}/${capability}-${suffix}` — i.e. the venture directory prefix IS the tenancy boundary — but the reader never enforces the prefix the writer creates. '
        + 'PROBE (real module, spy client): checkAssetViewAuthorized(venture-AUTHORIZED) -> {allowed:true}; mintAssetViewUrl(supabase,{ventureId:"venture-AUTHORIZED", storagePath:"venture-VICTIM/image-secret"}) -> RETURNED a signed URL for venture-VICTIM/image-secret. The victim venture evaluated on its own returns {allowed:false, reason:"product_review_not_approved"}. '
        + 'This directly contradicts the SD title ("prevent generated media assets from being externally reachable before S23+S24"): as built the fence enforces "the caller NAMED an authorized venture", not "THIS ASSET\'s venture is authorized".',
      exploitability: 'Not live-exploitable today (grep confirms zero consumers of mintAssetViewUrl outside its own test). Latent: becomes exploitable the moment any consumer derives storagePath from request input, which is the natural shape for the planned Child C review UI.',
      recommendation:
        'Bind subject to resource in mintAssetViewUrl before signing. Cheapest fix with NO schema dependency (matches asset-storage.js:108 exactly): reject unless typeof storagePath === "string" && storagePath.startsWith(`${ventureId}/`), and reject any path containing a "." path segment or a backslash. Stronger/preferred: change the signature to take an assetId and resolve {venture_id, storage_path} from creative_assets server-side, removing caller control of the path entirely (depends on the pending creative_assets.storage_path migration).',
    },
    {
      id: 'SEC-B2',
      severity: 'high',
      title: 'Unvalidated storagePath permits cross-BUCKET path traversal out of creative-assets-private',
      location: 'lib/creative/asset-view-gate.js:122 -> @supabase/storage-js StorageFileApi.ts:659 + _getFinalPath (:1353-1355)',
      detail:
        '_getFinalPath strips ONLY leading slashes (`path.replace(/^\\/+/, "")`) — it does not strip or reject ".." segments. createSignedUrl builds the literal string `${url}/object/sign/${bucketId}/${path}` and hands it to fetch(), whose WHATWG URL parsing resolves dot-segments BEFORE the request goes out. '
        + 'EXECUTION TRACE (local http server capturing req.url, not a def-site read): storagePath "../chairman-docs/roadmap.pdf" -> server received "/storage/v1/object/sign/chairman-docs/roadmap.pdf"; storagePath "ventureA/../../venture-logos/logo.png" -> server received "/storage/v1/object/sign/venture-logos/logo.png". The bucket literal is erased on the wire, so Supabase Storage cannot distinguish it from a legitimate request for that other bucket and will sign it (service-role keys bypass storage RLS). '
        + 'Live buckets in this account per LEAD/PLAN VALIDATION evidence include chairman-docs, chairman-roadmap and chairman-daily-review — lib/storage/private-signed-upload.js\'s own header calls the chairman roadmap image "confidentiality-critical". Same root cause and same fix as SEC-B1; recorded separately because the blast radius is the whole storage account, not just a sibling venture.',
      recommendation: 'Included in the SEC-B1 fix: explicitly reject any storagePath whose segments include "." or ".." (and backslashes) in addition to the venture-prefix assertion. Add a unit test per vector — the existing mock fixture already captures the path handed to createSignedUrl, so both are assertable today with no new fixture work.',
    },
    {
      id: 'SEC-B3',
      severity: 'low',
      title: 'Module header overstates the chairman override as authorizing "exactly one view"',
      location: 'lib/creative/asset-view-gate.js:25-28',
      detail:
        'The override is one-shot at the MINT layer (armed:true -> shouldConsume:true, atomically claimed). But the artifact it produces is a bearer URL valid for 300s and replayable an unlimited number of times, and freely shareable, within that window. "Authorizes exactly one view, never standing access" is therefore inaccurate — it authorizes exactly one MINT. Distinct from the SD\'s documented/accepted item #2 (which correctly describes the one-shot consumption semantics); this is a header-accuracy issue about what the consumed override actually buys.',
      recommendation: 'Reword to "authorizes exactly one mint; the resulting URL remains valid for its TTL (<=300s)". No code change required.',
    },
    {
      id: 'SEC-B4',
      severity: 'info',
      title: 'Probes 1, 3, 4 and 5 returned CLEAN — no defect found',
      location: 'lib/creative/asset-view-gate.js, lib/governance/stage-gate-predicate.js',
      detail:
        'INJECTION/TYPE-CONFUSION (probe 1): clean. Exercised postgrest-js .eq() directly — "&", ",", "\'" are all percent-encoded by URLSearchParams, so no PostgREST filter injection via ventureId. Truthy non-strings that survive the `!ventureId` guard ({} -> "eq.[object Object]", [] -> "eq.") produce 22P02 against the uuid column -> reviewError -> {allowed:false}. Every path fails CLOSED. '
        + 'REASON-STRING LEAK (probe 3): acceptable. missing_venture_id / product_review_not_approved / lifecycle_stage_gate_blocked distinguish states, but the caller must already possess a ventureId and the surface is a chairman/reviewer UI, not an anonymous endpoint. Note it becomes a cross-tenant venture-enumeration oracle only if a consumer accepts a caller-controlled ventureId — an amplifier of SEC-B1, not an independent finding. '
        + 'LOG LEAKAGE (probe 4): clean. asset-view-gate.js has ZERO console/logger calls. Its transitive imports emit three console.warn calls (stage-gate-predicate.js:140, :214, :219), all of which interpolate ONLY error.message — never ventureId, storagePath or signedUrl. audit_log rows carry venture_id by design but no path/URL (asserted by the existing no-persist test). '
        + 'TOCTOU (probe 5): benign. The S23 read and S24 check are two unsnapshotted queries, but the window is milliseconds, the state transitions are chairman-driven rather than attacker-driven, and the more dynamic S24 leg runs SECOND (the safer ordering). The signed URL surviving revocation for its TTL is inherent to signed URLs and is already bounded by the 300s cap.',
      recommendation: 'No action.',
    },
  ],
  warnings: [
    'The three KNOWN/ACCEPTED items supplied with this review (pending storage_path / override_key migrations; the intentional one-shot chairman override; deferred venture-logos / vision-briefs public buckets) were each re-checked and NOT re-flagged. SEC-B1/SEC-B2 are materially different and are not covered by any of them.',
    'SEC-B1 and SEC-B2 share one root cause: mintAssetViewUrl trusts a caller-supplied resource identifier. A fix that only adds a venture-prefix check without also rejecting dot-segments leaves SEC-B2 partially open (e.g. "ventureA/../../venture-logos/logo.png" starts with the correct prefix yet still escapes).',
    'Test-coverage note: the suite now runs 14/14 green (TS-9 and TS-10, previously reported absent by TESTING, are present). No test exercises storagePath at all — every mint test passes the well-formed `${VENTURE_ID}/image-1`. The defect is invisible to the current suite by construction.',
  ],
  recommendations: [
    'BLOCKING: add resource binding to mintAssetViewUrl — assert typeof storagePath === "string", assert storagePath.startsWith(`${ventureId}/`), and reject any "." / ".." path segment or backslash, before calling createSignedUrl. ~6 lines, zero schema dependency.',
    'BLOCKING: add two unit tests using the existing mock fixture (which already records the path passed to createSignedUrl) — (a) mismatched ventureId/storagePath pair throws and never reaches createSignedUrl; (b) a "../" storagePath throws and never reaches createSignedUrl.',
    'Preferred follow-up: change the public signature to mintAssetViewUrl(supabase, {assetId, ttlSeconds}) and resolve {venture_id, storage_path} from creative_assets internally, so no caller can ever supply a path. Removes this defect class permanently rather than validating around it.',
    'Reword the lib/creative/asset-view-gate.js:25-28 override comment from "exactly one view" to "exactly one mint (URL valid for its <=300s TTL)".',
    'When Child C wires the first consumer, re-run this binding check — the module header tells consumers to trust this primitive, so the primitive must actually enforce the asset-to-venture invariant rather than delegating it back to the caller.',
  ],
  validation_mode: 'retrospective',
  metadata: {
    recorded_by: 'security-agent (Task tool dispatch)',
    assessment_type: 'exec_to_plan_security_review',
    files_reviewed: [
      'lib/creative/asset-view-gate.js',
      'lib/creative/asset-view-gate.test.js',
      'lib/governance/stage-gate-predicate.js',
      'lib/eva/chairman-product-review.js',
      'lib/creative/asset-storage.js',
      'lib/storage/private-signed-upload.js',
      'lib/creative/creative-brief.js',
    ],
    probes_run: [
      'probe-url-norm: new URL() dot-segment resolution on the storage-js path template',
      'probe-gate: real asset-view-gate module + spy supabase client -> cross-venture and traversal mints both SUCCEEDED',
      'probe-wire: local http server capturing req.url -> confirmed the bucket literal is erased on the wire for a "../" path (execution trace, not a def-site read)',
      'probe-inject: postgrest-js .eq() encoding for 7 hostile ventureId values -> no injection possible, all fail closed',
      'npx vitest run lib/creative/asset-view-gate.test.js -> 14 passed (14)',
    ],
    exploitability_note: 'No live exploit today (zero consumers of mintAssetViewUrl). Latent defect in a primitive that declares itself the mandatory fence for all future consumers.',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, { phase: 'EXEC_TO_PLAN' });
console.log('Stored SECURITY evidence id:', stored.id);
console.log('Verdict:', results.verdict, '| confidence:', results.confidence, '| findings:', results.findings.length);
