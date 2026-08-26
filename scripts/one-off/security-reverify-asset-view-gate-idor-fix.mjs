// One-off: SECURITY sub-agent re-verification of the IDOR/path-traversal fix (commit c9cd48ca278)
// in lib/creative/asset-view-gate.js, superseding FAIL row 9c36f751-5460-4b55-b546-afdba145c473.
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Re-verification of commit c9cd48ca278 against SECURITY FAIL row 9c36f751-5460-4b55-b546-afdba145c473 (mintAssetViewUrl authorized the SUBJECT (ventureId) but signed any RESOURCE (storagePath) the caller named). The PRIMARY IDOR IS GENUINELY CLOSED, measured not assumed: the new assertStoragePathBelongsToVenture() runs after checkAssetViewAuthorized and before createSignedUrl, and an executable bypass probe driving the REAL mintAssetViewUrl confirmed the original PoC (authorized venture-1 + storagePath venture-VICTIM/image-secret) now throws STORAGE_PATH_VENTURE_MISMATCH with createSignedUrl call-count 0. The prefix check uses the literal `${ventureId}/` INCLUDING the separator, so the prefix-substring attack (authorized venture-1 reaching venture-10/secret) is also blocked; ventureId cannot be desynchronized from the authorization decision because mintAssetViewUrl passes the same single variable to both the authz call and the binding assert -- there is no second parameter and no re-read, hence no TOCTOU. Mutation-verified: commenting out the guard call fails exactly the 2 new regression tests and nothing else. 69/69 lib/creative tests pass with the guard in place; the legitimate `${VENTURE_ID}/image-1` path still signs normally, and asset-storage.js#persistAssetPrivately writes under the identical `${ventureId}/` template, so no legitimate read is broken. NOT a full PASS because SEC-B2 (the path-traversal leg) is only PARTIALLY closed: the guard rejects only a literal ".." split(\'/\') segment, and 5 obfuscated variants were measured reaching createSignedUrl. Those are defense-in-depth residuals, not a reopening of the IDOR (all remain under the authorized venture prefix and Supabase Storage resolves object keys by exact string match), but SEC-B2 was raised precisely as insurance against downstream normalization, so it is not fully discharged.',
  findings: [
    {
      id: 'SEC-B1-REVERIFY',
      severity: 'resolved',
      title: 'Primary IDOR (row 9c36f751-5460-4b55-b546-afdba145c473) is CLOSED',
      detail:
        'lib/creative/asset-view-gate.js:152 calls assertStoragePathBelongsToVenture(storagePath, ventureId) AFTER the checkAssetViewAuthorized block (lines 144-150) and BEFORE supabase.storage.from(BUCKET).createSignedUrl (line 155). Executable probe against the real exported function: "venture-VICTIM/image-secret" with authorized ventureId "venture-1" -> throws STORAGE_PATH_VENTURE_MISMATCH, createSignedUrl invocation count 0. Ordering and non-invocation both measured, not inferred from source reading alone.',
    },
    {
      id: 'SEC-B1-PREFIX-SUBSTRING',
      severity: 'resolved',
      title: 'Prefix-substring cross-read (venture-1 -> venture-10) does not work',
      detail:
        'expectedPrefix is `${ventureId}/` with the trailing separator included, so "venture-10/secret" does not satisfy startsWith("venture-1/"). Probe: blocked STORAGE_PATH_VENTURE_MISMATCH, signedCalls=0. The traversal-back variant "venture-10/../venture-2/secret" is blocked earlier by the ".." segment check. Additionally the traversal check is evaluated BEFORE the prefix check, so a hypothetical ventureId containing ".." could not be used to smuggle a traversal through the prefix comparison.',
    },
    {
      id: 'SEC-B1-VENTUREID-TRUST',
      severity: 'resolved',
      title: 'ventureId cannot be manipulated independently of the authorization check',
      detail:
        'mintAssetViewUrl destructures ventureId once and passes that same binding to checkAssetViewAuthorized({supabase, ventureId}) and to assertStoragePathBelongsToVenture(storagePath, ventureId). There is no separate caller-supplied "owner" parameter, no re-read between the two, and no await between them that could swap the value. The subject that was authorized is exactly the subject the resource is bound to. A non-UUID/crafted ventureId cannot pass the S23 leg (a PostgREST .eq on a uuid column with a malformed value yields reviewError, which fails closed at line 84).',
    },
    {
      id: 'SEC-B2-PARTIAL',
      severity: 'medium',
      title: 'SEC-B2 traversal defense is only partially closed: obfuscated ".." variants pass the guard',
      detail:
        'The check is storagePath.split("/").includes(".."), which only matches an exact literal ".." segment. Measured against the real mintAssetViewUrl, these 5 crafted paths PASSED the guard and reached createSignedUrl: "venture-1/%2e%2e/venture-2/secret", "venture-1/..%2fventure-2/secret", "venture-1/....//venture-2/secret", "venture-1/..\\\\venture-2\\\\secret" (backslash separators), and "venture-1/\\uFF0E\\uFF0E/venture-2/secret" (fullwidth dots). IMPORTANT SCOPE LIMIT: these are NOT a reopening of the IDOR. Each retains the authorized `${ventureId}/` prefix, and Supabase Storage resolves an object key by exact string match against storage.objects.name, so the crafted keys should simply 404. HOWEVER, @supabase/storage-js does NOT percent-encode the path before the request (StorageFileApi.ts:659 posts to `${this.url}/object/sign/${_path}` with _path built raw by _getFinalPath), so a literal "%2e%2e" does reach the wire and would be decoded to ".." by the origin router. Whether any intermediary in front of storage-api resolves dot-segments after decoding was NOT measured by this review and must not be asserted in either direction. Recommend hardening to a positive allowlist on the post-prefix remainder rather than a ".."-denylist.',
    },
    {
      id: 'SEC-B3-NO-CALLER-IDENTITY',
      severity: 'medium',
      title: 'Residual (out of the original finding scope): the gate binds resource->venture but nothing binds venture->requester',
      detail:
        'checkAssetViewAuthorized answers "is this venture\'s asset viewable right now" (S23 approval + S24 stage), never "may THIS user view it" -- the module takes no user/actor identity (actorType/actorId are hardcoded literals used only for audit and override keying). The fix correctly binds the RESOURCE to the SUBJECT; the SUBJECT is still unbound to the REQUESTER. Any consumer that lets an end user supply ventureId can therefore still read any venture that happens to be S23-approved and at S24. This is the natural next IDOR and MUST be closed by the consumer (Child C review UI) via RLS or a server-side venture-membership check before calling mintAssetViewUrl. Flagged plainly rather than softened.',
    },
    {
      id: 'SEC-REGRESSION-TESTS-VERIFIED',
      severity: 'info',
      title: 'The 2 new regression tests genuinely exercise the fixed code path (mutation-verified)',
      detail:
        'lib/creative/asset-view-gate.test.js:193-209. Both assert the thrown code AND that createSignedUrl was never called (vi.spyOn ... not.toHaveBeenCalled), so they cannot pass vacuously on a generic throw. Mutation check performed: commenting out the assertStoragePathBelongsToVenture call at line 152 makes exactly those 2 tests fail (2 failed | 14 passed) and no others; restoring the line returns 16/16. The tests are therefore not blind. Run evidence: `npx vitest run lib/creative/asset-view-gate.test.js` = 16/16 passed.',
    },
    {
      id: 'SEC-NO-NEW-REGRESSION',
      severity: 'info',
      title: 'No regression introduced; the legitimate read path still works',
      detail:
        '`npx vitest run lib/creative/` = 6 files / 69 tests passed. The legitimate call storagePath=`${VENTURE_ID}/image-1` still mints (probe: SIGNED "venture-1/image-1"). The guard matches the real write convention: asset-storage.js:108 writes `${ventureId}/${capability}-${suffix}`, so every persisted object satisfies the new prefix requirement by construction. Type-confusion inputs (String object, array) now fail closed with INVALID_STORAGE_PATH instead of being forwarded to createSignedUrl as they were pre-fix.',
    },
    {
      id: 'SEC-CASE-SENSITIVITY',
      severity: 'low',
      title: 'Prefix comparison is case-sensitive; a case-differing ventureId fails closed (availability, not security)',
      detail:
        'Postgres uuid equality is case-insensitive, so a venture can authorize with an uppercase-rendered id while its stored objects use the lowercase form; startsWith would then reject a legitimate read (probe: ventureId "VENTURE-1" + path "venture-1/image-1" -> STORAGE_PATH_VENTURE_MISMATCH). Fails in the safe direction (denial, never disclosure). Worth normalizing case if callers ever pass a non-canonical uuid rendering.',
    },
  ],
  warnings: [
    'SEC-B2 is only partially discharged: the ".." denylist misses percent-encoded, dot-collapse, backslash and unicode-homoglyph variants (5 measured reaching createSignedUrl). Not independently exploitable against exact-key Supabase object lookup, but the insurance SEC-B2 was meant to provide is incomplete.',
    'This module still has zero caller-identity binding. Do not treat mintAssetViewUrl as a complete authorization boundary for a user-facing surface.',
    'Whether a normalizing intermediary sits in front of storage-api was NOT measured. Neither its presence nor its absence should be asserted downstream on the strength of this review.',
  ],
  recommendations: [
    'Harden assertStoragePathBelongsToVenture from a ".."-denylist to a positive allowlist on the remainder after the `${ventureId}/` prefix, e.g. reject unless /^[A-Za-z0-9._-]+(\\/[A-Za-z0-9._-]+)*$/ matches and the remainder contains no "..", no "%", and no backslash. That closes all 5 measured obfuscation variants in one predicate and is ~3 lines.',
    'Add a regression test for at least the "%2e%2e" and "....//" variants once the allowlist lands, so the obfuscated class is pinned the way the literal ".." class now is.',
    'Child C consumer requirement: establish that the requesting user belongs to ventureId (RLS or explicit membership check) BEFORE calling mintAssetViewUrl; the gate deliberately does not do this.',
    'Consider case-normalizing ventureId and storagePath prefix comparison to avoid a false denial on non-canonical uuid rendering.',
  ],
  validation_mode: 'retrospective',
  metadata: {
    recorded_by: 'security-agent (Task tool dispatch, re-verification)',
    assessment_type: 'exec_to_plan_security_reverification',
    supersedes_finding_row: '9c36f751-5460-4b55-b546-afdba145c473',
    supersede_status: 'confirms-fixed (primary IDOR) / partially-fixed (SEC-B2 traversal)',
    fix_commit: 'c9cd48ca2788f70b84e946b630160000dfba3ebf',
    files_reviewed: [
      'lib/creative/asset-view-gate.js',
      'lib/creative/asset-view-gate.test.js',
      'lib/creative/asset-storage.js',
      'node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts',
    ],
    verification_methods: [
      'fresh full re-read of the post-fix source (not memory of the prior version)',
      'executable bypass probe driving the real exported mintAssetViewUrl with 18 crafted storagePath candidates',
      'mutation test: guard call disabled -> exactly the 2 new regression tests fail; restored -> 16/16',
      'npx vitest run lib/creative/asset-view-gate.test.js = 16/16 passed',
      'npx vitest run lib/creative/ = 6 files / 69 tests passed',
      'git working tree confirmed clean of probe/mutation artifacts after the run',
    ],
    probe_bypasses_reaching_createSignedUrl: [
      'venture-1/%2e%2e/venture-2/secret',
      'venture-1/..%2fventure-2/secret',
      'venture-1/....//venture-2/secret',
      'venture-1/..\\venture-2\\secret',
      'venture-1/．．/venture-2/secret',
    ],
    probe_blocked_before_signing: [
      'venture-VICTIM/image-secret -> STORAGE_PATH_VENTURE_MISMATCH (original PoC)',
      'venture-1/../venture-2/secret -> STORAGE_PATH_TRAVERSAL',
      'venture-10/secret -> STORAGE_PATH_VENTURE_MISMATCH (prefix-substring)',
      'venture-10/../venture-2/secret -> STORAGE_PATH_TRAVERSAL',
      'venture-1\\..\\venture-2\\secret -> STORAGE_PATH_VENTURE_MISMATCH',
      'venture-1/x\\u0000/../venture-2/secret -> STORAGE_PATH_TRAVERSAL (null byte)',
      '/venture-1/../venture-2/secret -> STORAGE_PATH_TRAVERSAL',
      'new String("venture-VICTIM/image-secret") -> INVALID_STORAGE_PATH',
      '["venture-VICTIM/image-secret"] -> INVALID_STORAGE_PATH',
    ],
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
console.log('Stored SECURITY re-verification evidence id:', stored.id);
console.log('verdict:', results.verdict, '| confidence:', results.confidence);
