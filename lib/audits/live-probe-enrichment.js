/**
 * live-probe-enrichment — turn buildEvidence's hardcoded `live: {probed:false}` into a REAL
 * reading. SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5.
 *
 * WHY THIS IS A SEPARATE PASS RATHER THAN AN EDIT TO buildEvidence: buildEvidence is synchronous
 * and is called inside a population.map() in the sweep CLI. Live probing needs a database round
 * trip. Rewriting buildEvidence async would ripple through every caller, so enrichment runs as an
 * explicit second step over the evidence objects. buildEvidence keeps reporting probed:false, which
 * stays the correct answer whenever enrichment does not run.
 *
 * DEFAULT-OFF BY CONSTRUCTION. With no client this is a no-op that returns the evidence unchanged,
 * so the sweep's behaviour is byte-identical until a caller opts in. That matters because flipping
 * live.probed activates three verdict branches (APPLIED, APPLIED-BUT-DIVERGENT,
 * NOT-APPLIED-BUT-COMPLETED) that have never executed in production, and doing it on partial
 * evidence would make the sweep confidently wrong where it is currently honestly silent.
 *
 * BOTH FLAGS ARE SET HONESTLY OR NEITHER IS. chairman-apply-collectors.js:199-205 warns that 21
 * rows would reach hasApproval with provenance never established the moment a prober lands, because
 * the approval text and artifact path share one origin. provenanceIndependent is therefore taken
 * from the RESOLVER (true only when content came off the filesystem), never assumed here.
 */
import { resolveApprovedArtifact } from './approval-artifact-resolver.js';

/**
 * Probe one evidence object. Pure except for the injected probe/resolver.
 *
 * @param {object} evidence - output of buildEvidence(item)
 * @param {object} opts
 * @param {object|null} opts.client        - pg client; null/absent => no-op (default OFF)
 * @param {string}      opts.repoRoot
 * @param {Function}    opts.captureObjectDefinitions - (client, objects) => Promise<Array>
 * @param {Function}   [opts.resolve]      - injectable resolver (tests)
 * @returns {Promise<object>} a NEW evidence object; the input is not mutated
 */
export async function enrichEvidenceWithLiveProbe(evidence, opts = {}) {
  const { client, repoRoot, captureObjectDefinitions, resolve = resolveApprovedArtifact } = opts;
  if (!client || typeof captureObjectDefinitions !== 'function') return evidence;

  const artifactPath = evidence?.artifact?.path || null;
  const resolution = resolve({ artifactPath, repoRoot });

  if (!resolution.resolved) {
    // Unresolvable stays UNVERIFIABLE. Reporting WHY is the difference between an honest
    // "we could not check" and today's undifferentiated silence.
    return {
      ...evidence,
      live: { probed: false, unresolved_reason: resolution.reason },
    };
  }

  let captured;
  try {
    captured = await captureObjectDefinitions(client, resolution.objects);
  } catch (e) {
    // A probe that ERRORED did not observe anything. Saying probed:true here would assert an
    // observation we never made — the precise shape of every fail-open in this area.
    return {
      ...evidence,
      live: { probed: false, probe_error: String((e && e.message) || e).slice(0, 200) },
    };
  }

  // An object the approval declares but the database does not have is the NOT-APPLIED signal.
  // Distinguish it from "we could not look", which is the distinction the sweep has never had.
  const absent = captured.filter((c) => c.definition == null);

  return {
    ...evidence,
    approval: { ...evidence.approval, provenanceIndependent: resolution.provenanceIndependent === true },
    live: {
      probed: true,
      artifact_path: resolution.path,
      artifact_hash: resolution.contentHash,
      declared: resolution.objects.length,
      observed: captured.length - absent.length,
      absent: absent.map((a) => `${a.kind}:${a.schema}.${a.table ? `${a.table}.` : ''}${a.name}`),
      definitions: captured,
    },
  };
}

/**
 * Enrich a list. Sequential on purpose: these are database round trips against a shared pooler,
 * and a sweep is not latency-critical. Failing one item never aborts the rest.
 */
export async function enrichAllWithLiveProbe(evidences, opts = {}) {
  const out = [];
  for (const e of evidences) out.push(await enrichEvidenceWithLiveProbe(e, opts));
  return out;
}
