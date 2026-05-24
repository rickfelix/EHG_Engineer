/**
 * GVOS Snapshot Locker — Node.js port for the EHG_Engineer worker (FR-6 lock, backend half).
 *
 * SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001.
 *
 * Mirrors the PURE `buildLockedSnapshot` from EHG/src/lib/gvos/snapshot-locker.ts. The
 * frontend locker (lockSnapshot) is browser-client and was never invoked at the S17
 * transition (locked_at stayed NULL for every venture, including RPC-auto-advanced ones
 * like Canvas AI). This backend port lets the S17 post-stage hook freeze the snapshot for
 * ALL ventures regardless of how they advanced.
 *
 * Parity contract: buildLockedSnapshot() output (incl. snapshot_hash) MUST equal
 * EHG/src/lib/gvos/snapshot-locker.ts for the same inputs. The DB I/O (load profile/
 * archetype/tokens, write the lock) lives in the worker hook, mirroring how the S11
 * GvosProfile hook wraps the pure rule-classifier.
 *
 * Lock contents frozen: archetype_prompt_token, tokens_required (effective, post-decompose,
 * compliance-excluded), substrate, accent, typography_voice, token_overrides,
 * locked_token_versions[], snapshot_hash. Compliance-category tokens are EXCLUDED from the
 * lock so they keep propagating live via the compliance overlay.
 */
import { decompose, isPackToken } from './pack-decomposer.js';

/**
 * Build a locked snapshot from registry inputs. Pure — no I/O.
 *
 * @param {{ prompt_token: string, tokens_required: string[], substrate?: object, accent?: object, typography_voice: string }} archetype
 * @param {ReadonlyArray<{ name: string, category: string, version_major: number, version_minor: number, version_patch: number }>} liveTokens
 * @param {object} token_overrides
 * @param {(input: string) => string} [hash]
 * @returns {{ locked: object, decomposed_packs: string[], excluded_compliance_tokens: string[] }}
 */
export function buildLockedSnapshot(archetype, liveTokens, token_overrides, hash = defaultHash) {
  // Step 1: decompose any pack tokens in tokens_required
  const decomp = decompose(archetype.tokens_required);

  // Step 2: effective non-pack token names (non-disabled, non-pack)
  const effectiveNonPackNames = decomp.non_pack_tokens.filter(
    (n) => !decomp.disabled.includes(n) && !isPackToken(n),
  );

  // Step 3: version lookup for non-pack tokens with registry entries.
  const liveTokenMap = new Map();
  for (const t of liveTokens) liveTokenMap.set(t.name, t);

  // Exclude compliance-category tokens from the lock (live propagation).
  const excluded_compliance_tokens = [];
  const lockableNames = [];
  for (const name of effectiveNonPackNames) {
    const row = liveTokenMap.get(name);
    if (row && row.category === 'compliance') {
      excluded_compliance_tokens.push(name);
      continue;
    }
    lockableNames.push(name);
  }
  // Pack token names are versioned units even though their atomics expand at composer time.
  for (const p of decomp.packs_found) lockableNames.push(p);

  const locked_token_versions = lockableNames
    .map((name) => {
      const row = liveTokenMap.get(name);
      if (!row) return null;
      return {
        token_name: name,
        version_major: row.version_major,
        version_minor: row.version_minor,
        version_patch: row.version_patch,
      };
    })
    .filter((v) => v !== null)
    .sort((a, b) => a.token_name.localeCompare(b.token_name));

  const tokens_required = [...lockableNames].sort();

  const lockedWithoutHash = {
    archetype_prompt_token: archetype.prompt_token,
    tokens_required,
    substrate: archetype.substrate ?? {},
    accent: archetype.accent ?? {},
    typography_voice: archetype.typography_voice,
    token_overrides: token_overrides ?? {},
    locked_token_versions,
  };
  const snapshot_hash = hash(canonicalJSON(lockedWithoutHash));

  return {
    locked: { ...lockedWithoutHash, snapshot_hash },
    decomposed_packs: decomp.packs_found,
    excluded_compliance_tokens,
  };
}

// ─── Helpers (mirror the TS) ──────────────────────────────────────────────────

function canonicalJSON(obj) {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const sorted = {};
    for (const k of Object.keys(v).sort()) sorted[k] = sortKeys(v[k]);
    return sorted;
  }
  return v;
}

/**
 * FNV-1a 64-bit hex — must match the TS defaultHash exactly so backend- and
 * frontend-computed snapshot_hash values are identical for the same input.
 * @param {string} input
 */
export function defaultHash(input) {
  let hi = 0xcbf29ce4 >>> 0;
  let lo = 0x84222325 >>> 0;
  for (let i = 0; i < input.length; i++) {
    lo ^= input.charCodeAt(i);
    const a = lo * 0x1b3;
    const b = lo * 0x100;
    const c = hi * 0x1b3;
    lo = (a >>> 0);
    hi = ((b + c + Math.floor(a / 0x100000000)) >>> 0);
  }
  const toHex8 = (n) => ('00000000' + n.toString(16)).slice(-8);
  return toHex8(hi) + toHex8(lo);
}
