/**
 * SUB_AGENT_REPO_RESOLUTION Gate
 * Part of SD-LEO-INFRA-FLEET-WIDE-SUB-001 (FR-3)
 *
 * Validates that every sub_agent_execution_results row tied to the SD (or its
 * orchestrator children) ran against the correct repo. Closes the 8-locus
 * cwd-default leak surfaced by SD-LEO-INFRA-CROSS-REPO-AWARE-001
 * (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * Trusts the v_sub_agent_repo_compliance view (migration
 * 20260526_capa4_sub_agent_repo_resolution.sql) for the LEGACY / COMPLIANT /
 * EXPLICIT_NULL / CWD_LEAK / VIOLATION / UNKNOWN_APPLICATION classification.
 * Augments with raw metadata reads for SKIPPED (sub-agent-only) and
 * EMPTY_PROBE (resolved-but-empty) statuses which the view does not project.
 *
 * Backward compatibility (critical):
 *   - Rows whose metadata lacks the repo_path key are LEGACY → full credit.
 *     The view uses (metadata ? 'repo_path'), not IS NULL, so an explicit
 *     null value is correctly distinguished from a missing key.
 *   - SDs whose target_application is EHG or EHG_Engineer are intra-repo;
 *     unresolved rows for these are tolerated (CONDITIONAL_PASS @ 70).
 *     UNRESOLVED only BLOCKS for cross-repo targets.
 */

const REASON_CODES = {
  HEALTHY: 'SUB_AGENT_REPO_HEALTHY',
  LEGACY: 'SUB_AGENT_REPO_LEGACY',
  SKIPPED: 'SUB_AGENT_REPO_SKIPPED',
  EMPTY_PROBE: 'SUB_AGENT_REPO_EMPTY_PROBE',
  UNRESOLVED: 'SUB_AGENT_REPO_UNRESOLVED',
  CWD_LEAK: 'SUB_AGENT_REPO_CWD_LEAK',
  EXPLICIT_NULL: 'SUB_AGENT_REPO_EXPLICIT_NULL',
  VIOLATION: 'SUB_AGENT_REPO_VIOLATION',
  UNKNOWN_APPLICATION: 'SUB_AGENT_REPO_UNKNOWN_APPLICATION'
};

const INTRA_REPO_TARGETS = new Set(['EHG', 'EHG_Engineer']);

// Statuses that block the gate (BLOCKED verdict)
const BLOCKING_STATUSES = new Set(['cwd_leak', 'violation', 'explicit_null']);

/**
 * QF-20260527-673: normalize a filesystem path for cross-platform gate
 * comparison. Forward-slashifies backslashes (Windows writers vs Linux CI
 * applications.local_path) and strips trailing slashes.
 */
function normalizePathForGate(p) {
  if (!p || typeof p !== 'string') return null;
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * QF-20260527-673: a writer-emitted repo_path is "toplevel-compatible" with
 * the expected repo path when they're equal post-normalization OR when the
 * writer is a `.worktrees/<id>` subdirectory of the expected toplevel. A
 * sub-agent that ran from a git worktree records the worktree path (per
 * resolve-repo.js executed_from_cwd semantics) — a valid path inside the
 * same repo per `git rev-parse --show-toplevel` but not string-equal.
 */
function pathsAreToplevelCompatible(writerNorm, expectedNorm) {
  if (!writerNorm || !expectedNorm) return false;
  if (writerNorm === expectedNorm) return true;
  return writerNorm.startsWith(expectedNorm + '/.worktrees/');
}

// Statuses that downgrade to CONDITIONAL_PASS
const CONDITIONAL_STATUSES = new Set(['skipped', 'empty_probe', 'unresolved_intra']);

/**
 * Re-classify a raw row using metadata fields that v_sub_agent_repo_compliance
 * doesn't project (skip_reason, repo_resolved/probe_exists) while keeping the
 * view's status as the base classification.
 *
 * @param {Object} viewRow - row from v_sub_agent_repo_compliance
 * @param {Object} rawRow  - matching row from sub_agent_execution_results
 * @param {string|null} targetApp - SD.target_application
 * @returns {{status: string, reasonCode: string, detail: string}}
 */
function classifyRow(viewRow, rawRow, targetApp) {
  const meta = (rawRow && rawRow.metadata) || {};
  const skipReason = meta.skip_reason;
  const repoResolved = meta.repo_resolved;
  const probeExists = meta.probe_exists;

  // SKIPPED: sub-agent intentionally not run for this repo class
  if (typeof skipReason === 'string' &&
      /^sub_agent_(ehg|engineer)_only$/.test(skipReason)) {
    return {
      status: 'skipped',
      reasonCode: REASON_CODES.SKIPPED,
      detail: `skip_reason=${skipReason}`
    };
  }

  // View has spoken: explicit BLOCKED statuses
  if (viewRow.compliance_status === 'cwd_leak') {
    // QF-20260528-426: extend QF-20260527-673 path normalization to the cwd_leak
    // branch (the violation branch already had it). The view flags cwd_leak on
    // strict equality between executed_from_cwd and metadata.repo_path — but on
    // Windows the writer records backslashes while applications.local_path uses
    // forward slashes, so an intra-repo sub-agent that legitimately ran from its
    // own repo (cwd == repo == expected, modulo slashes) is false-blocked. If the
    // normalized writer path resolves under the expected toplevel, the sub-agent
    // ran from the CORRECT repo — not a leak. A real cross-repo leak (writer path
    // not under expected) still falls through to BLOCKED below.
    const writerNorm = normalizePathForGate(viewRow.metadata_repo_path);
    const expectedNorm = normalizePathForGate(viewRow.expected_repo_path);
    if (pathsAreToplevelCompatible(writerNorm, expectedNorm)) {
      return {
        status: 'healthy',
        reasonCode: REASON_CODES.HEALTHY,
        detail: `cwd_leak normalized: ${writerNorm} resolves under expected ${expectedNorm} (correct repo, not a leak)`
      };
    }
    return {
      status: 'cwd_leak',
      reasonCode: REASON_CODES.CWD_LEAK,
      detail: `repo_path equals executed_from_cwd (${viewRow.executed_from_cwd || 'n/a'})`
    };
  }
  if (viewRow.compliance_status === 'explicit_null') {
    return {
      status: 'explicit_null',
      reasonCode: REASON_CODES.EXPLICIT_NULL,
      detail: 'metadata.repo_path key present but value is null'
    };
  }
  if (viewRow.compliance_status === 'violation') {
    // QF-20260527-673: worktree-path normalization. The view does strict-
    // equality between metadata.repo_path and applications.local_path, which
    // false-positive blocks worktree paths (valid same-repo paths) and
    // slash-variant mismatches. Override only when post-normalize writer
    // resolves under the expected toplevel.
    const writerNorm = normalizePathForGate(viewRow.metadata_repo_path);
    const expectedNorm = normalizePathForGate(viewRow.expected_repo_path);
    if (pathsAreToplevelCompatible(writerNorm, expectedNorm)) {
      return {
        status: 'healthy',
        reasonCode: REASON_CODES.HEALTHY,
        detail: `worktree-path normalized: ${writerNorm} resolves under ${expectedNorm}`
      };
    }
    return {
      status: 'violation',
      reasonCode: REASON_CODES.VIOLATION,
      detail: `repo_path=${viewRow.metadata_repo_path} expected=${viewRow.expected_repo_path}`
    };
  }

  // EMPTY_PROBE: repo resolved but probed components dir was empty
  if (repoResolved === true && probeExists === false) {
    return {
      status: 'empty_probe',
      reasonCode: REASON_CODES.EMPTY_PROBE,
      detail: 'repo_resolved=true but probe_exists=false'
    };
  }

  // UNRESOLVED: repo_resolved=false; severity depends on target_application
  if (repoResolved === false) {
    if (targetApp && !INTRA_REPO_TARGETS.has(targetApp)) {
      return {
        status: 'unresolved',
        reasonCode: REASON_CODES.UNRESOLVED,
        detail: `repo_resolved=false for cross-repo target=${targetApp}`
      };
    }
    return {
      status: 'unresolved_intra',
      reasonCode: REASON_CODES.UNRESOLVED,
      detail: `repo_resolved=false but intra-repo target=${targetApp || 'unknown'} (conditional)`
    };
  }

  // UNKNOWN_APPLICATION: applications table has no row for target_application
  if (viewRow.compliance_status === 'unknown_application') {
    return {
      status: 'unknown_application',
      reasonCode: REASON_CODES.UNKNOWN_APPLICATION,
      detail: `target_application=${targetApp || 'null'} not in applications table`
    };
  }

  // LEGACY: pre-CAPA-4 row, no repo_path key — full credit (backward compat)
  if (viewRow.compliance_status === 'legacy') {
    return {
      status: 'legacy',
      reasonCode: REASON_CODES.LEGACY,
      detail: 'pre-CAPA-4 row (no repo_path key) — full credit'
    };
  }

  // HEALTHY: compliant per view
  if (viewRow.compliance_status === 'compliant') {
    return {
      status: 'healthy',
      reasonCode: REASON_CODES.HEALTHY,
      detail: `repo_path matches applications.local_path`
    };
  }

  // Fallback: shouldn't reach here; treat as legacy (full credit, no surprise blocks)
  return {
    status: 'legacy',
    reasonCode: REASON_CODES.LEGACY,
    detail: `unrecognized compliance_status=${viewRow.compliance_status} — defaulted to legacy`
  };
}

/**
 * Collect SD UUIDs to scan: the SD itself plus any orchestrator children.
 */
async function collectSdScope(supabase, sd) {
  const sdId = sd?.id || sd?.uuid_id;
  if (!sdId) return [];

  const ids = [sdId];

  try {
    const { data: children } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('parent_sd_id', sdId);
    if (Array.isArray(children)) {
      for (const c of children) {
        if (c?.id) ids.push(c.id);
      }
    }
  } catch (_) {
    // Non-blocking: if we can't enumerate children, scan the parent alone.
  }

  return ids;
}

/**
 * Create the SUB_AGENT_REPO_RESOLUTION gate validator.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createSubAgentRepoResolutionGate(supabase) {
  return {
    name: 'SUB_AGENT_REPO_RESOLUTION',
    validator: async (ctx) => {
      console.log('\n🧭 GATE: Sub-Agent Repo Resolution (FR-3)');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-LEO-INFRA-FLEET-WIDE-SUB-001');
      console.log('   View: v_sub_agent_repo_compliance');

      const sd = ctx?.sd || {};
      const targetApp = sd.target_application || null;

      let sdIds;
      try {
        sdIds = await collectSdScope(supabase, sd);
      } catch (e) {
        console.log(`   ⚠️  Could not collect SD scope: ${e.message}`);
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [`Sub-agent repo gate scope error: ${e.message}`],
          details: { error: e.message }
        };
      }

      if (sdIds.length === 0) {
        console.log('   ℹ️  No SD UUID — skipping (advisory)');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { skipped: true, reason: 'no_sd_uuid' }
        };
      }

      // Query the view + raw rows in parallel
      let viewRows = [];
      let rawRows = [];
      try {
        const [viewResp, rawResp] = await Promise.all([
          supabase
            .from('v_sub_agent_repo_compliance')
            .select('id, sd_id, sub_agent_code, phase, target_application, expected_repo_path, metadata_repo_path, metadata_repo_resolved, executed_from_cwd, compliance_status')
            .in('sd_id', sdIds),
          supabase
            .from('sub_agent_execution_results')
            .select('id, sub_agent_code, metadata')
            .in('sd_id', sdIds)
        ]);

        if (viewResp.error) throw new Error(`view: ${viewResp.error.message}`);
        if (rawResp.error) throw new Error(`raw: ${rawResp.error.message}`);

        viewRows = viewResp.data || [];
        rawRows = rawResp.data || [];
      } catch (e) {
        console.log(`   ⚠️  DB error reading sub-agent compliance: ${e.message}`);
        // Non-blocking on infra errors; surface as warning.
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [`Sub-agent repo gate DB error: ${e.message}`],
          details: { error: e.message }
        };
      }

      if (viewRows.length === 0) {
        console.log('   ℹ️  No sub_agent_execution_results rows for this SD — gate advisory pass');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { rows_scanned: 0, status: 'no_rows' }
        };
      }

      const rawById = new Map(rawRows.map(r => [r.id, r]));

      const buckets = {
        healthy: [], legacy: [], skipped: [], empty_probe: [],
        unresolved: [], unresolved_intra: [], cwd_leak: [],
        explicit_null: [], violation: [], unknown_application: []
      };

      const blockingDetails = [];
      const conditionalDetails = [];

      for (const vrow of viewRows) {
        const raw = rawById.get(vrow.id);
        const c = classifyRow(vrow, raw, targetApp);
        buckets[c.status].push({
          row_id: vrow.id,
          sub_agent_code: vrow.sub_agent_code,
          phase: vrow.phase,
          reasonCode: c.reasonCode,
          detail: c.detail
        });

        if (BLOCKING_STATUSES.has(c.status) || c.status === 'unresolved') {
          blockingDetails.push({
            row_id: vrow.id,
            sub_agent_code: vrow.sub_agent_code,
            phase: vrow.phase,
            status: c.status,
            reasonCode: c.reasonCode,
            detail: c.detail
          });
        } else if (CONDITIONAL_STATUSES.has(c.status)) {
          conditionalDetails.push({
            row_id: vrow.id,
            sub_agent_code: vrow.sub_agent_code,
            phase: vrow.phase,
            status: c.status,
            reasonCode: c.reasonCode,
            detail: c.detail
          });
        }
      }

      const total = viewRows.length;
      const summary = Object.entries(buckets)
        .filter(([, arr]) => arr.length > 0)
        .map(([k, arr]) => `${k}=${arr.length}`)
        .join(', ');
      console.log(`   📊 Rows scanned: ${total} (${summary})`);

      // BLOCKED: any cwd_leak / violation / explicit_null / cross-repo unresolved
      if (blockingDetails.length > 0) {
        // Pick the most severe reasonCode for the gate-level reasonCode
        // (priority: CWD_LEAK > VIOLATION > EXPLICIT_NULL > UNRESOLVED)
        const priority = [
          REASON_CODES.CWD_LEAK,
          REASON_CODES.VIOLATION,
          REASON_CODES.EXPLICIT_NULL,
          REASON_CODES.UNRESOLVED
        ];
        let gateReasonCode = REASON_CODES.VIOLATION;
        for (const code of priority) {
          if (blockingDetails.some(d => d.reasonCode === code)) {
            gateReasonCode = code;
            break;
          }
        }

        console.log('   ❌ BLOCKED: sub-agent repo resolution failures');
        for (const d of blockingDetails.slice(0, 10)) {
          console.log(`      • [${d.sub_agent_code}@${d.phase}] ${d.reasonCode}: ${d.detail}`);
        }

        return {
          passed: false,
          score: 0,
          max_score: 100,
          reasonCode: gateReasonCode,
          issues: blockingDetails.map(d =>
            `${d.reasonCode}: ${d.sub_agent_code}@${d.phase} (${d.detail})`
          ),
          warnings: [],
          remediation: 'Re-run the affected sub-agent(s) with FR-1 resolveSubAgentRepo wired so that metadata.repo_path equals applications.local_path.',
          details: {
            rows_scanned: total,
            buckets,
            blockingDetails,
            status: 'blocked'
          }
        };
      }

      // CONDITIONAL_PASS: skipped / empty_probe / intra-repo unresolved
      if (conditionalDetails.length > 0) {
        // Score band 60-80 by ratio of conditional rows
        const conditionalRatio = conditionalDetails.length / total;
        const score = Math.max(60, Math.min(80, Math.round(80 - conditionalRatio * 20)));

        console.log(`   ⚠️  CONDITIONAL_PASS @ ${score}: ${conditionalDetails.length}/${total} non-healthy rows`);
        for (const d of conditionalDetails.slice(0, 10)) {
          console.log(`      • [${d.sub_agent_code}@${d.phase}] ${d.reasonCode}: ${d.detail}`);
        }

        return {
          passed: true,
          score,
          max_score: 100,
          reasonCode: conditionalDetails[0].reasonCode,
          issues: [],
          warnings: conditionalDetails.map(d =>
            `${d.reasonCode}: ${d.sub_agent_code}@${d.phase} (${d.detail})`
          ),
          details: {
            rows_scanned: total,
            buckets,
            conditionalDetails,
            status: 'conditional_pass'
          }
        };
      }

      // PASS @ 100: all rows healthy or legacy
      console.log(`   ✅ PASS @ 100: all ${total} sub-agent rows healthy or legacy`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          rows_scanned: total,
          buckets,
          status: 'all_healthy'
        }
      };
    },
    required: true
  };
}

// Export reason codes for external consumers (tests, runner)
export { REASON_CODES };
