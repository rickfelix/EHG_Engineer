/**
 * Health Urgency Bridge
 * SD: SD-LEO-INFRA-PRIORITY-SCORER-HEALTH-001
 *
 * Bridges codebase_health_snapshots DB data to the healthData format
 * consumed by calculateHealthUrgency() in priority-scorer.js.
 *
 * Also provides:
 * - isHealthDerivedSD() for health SD detection
 * - checkHealthFreshness() for sd:next advisory
 * - loadHealthUrgencyForSD() for batch loading in sd-next queue
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Get a Supabase client (reuses process-level singleton pattern)
 */
function getSupabase() {
  return createSupabaseServiceClient();
}

/**
 * Build healthData object from latest codebase_health_snapshots.
 * This object is passed to calculateHealthUrgency() in priority-scorer.js.
 *
 * @param {Object} [supabase] - Supabase client (optional, creates one if not provided)
 * @returns {Promise<Object|null>} healthData or null if no snapshots exist
 */
export async function buildHealthDataFromSnapshots(supabase) {
  const sb = supabase || getSupabase();

  // Get latest snapshot per dimension
  const { data: snapshots } = await sb
    .from('codebase_health_snapshots')
    .select('dimension, score, finding_count, findings, scanned_at')
    .order('scanned_at', { ascending: false })
    .limit(20);

  if (!snapshots || snapshots.length === 0) return null;

  // Deduplicate: keep latest per dimension
  const latest = new Map();
  for (const snap of snapshots) {
    if (!latest.has(snap.dimension)) {
      latest.set(snap.dimension, snap);
    }
  }

  // Aggregate severity distribution across all dimensions
  const severity_distribution = { critical: 0, high: 0, medium: 0, info: 0 };
  let totalFindings = 0;
  let lowestScore = 100;
  let oldestScanMs = Date.now();

  for (const [, snap] of latest) {
    totalFindings += snap.finding_count || 0;
    if (snap.score < lowestScore) lowestScore = snap.score;
    const scanTime = new Date(snap.scanned_at).getTime();
    if (scanTime < oldestScanMs) oldestScanMs = scanTime;

    // Count severities from findings array
    if (Array.isArray(snap.findings)) {
      for (const f of snap.findings) {
        const sev = (f.severity || 'info').toLowerCase();
        if (sev === 'critical') severity_distribution.critical++;
        else if (sev === 'high' || sev === 'warning') severity_distribution.high++;
        else if (sev === 'medium') severity_distribution.medium++;
        else severity_distribution.info++;
      }
    }
  }

  const oldestFindingDays = (Date.now() - oldestScanMs) / (1000 * 60 * 60 * 24);

  return {
    finding_count: totalFindings,
    severity_distribution,
    oldest_finding_days: Math.round(oldestFindingDays * 10) / 10,
    dimension_score: lowestScore
  };
}

/**
 * Load health urgency max_points config from DB.
 * Falls back to default 20 if no config row exists.
 *
 * @param {Object} [supabase] - Supabase client
 * @returns {Promise<Object>} Config object with max_points
 */
export async function loadHealthUrgencyConfig(supabase) {
  const sb = supabase || getSupabase();
  try {
    const { data } = await sb
      .from('codebase_health_config')
      .select('metadata')
      .eq('dimension', 'health_urgency')
      .single();

    if (data?.metadata) {
      return {
        max_points: data.metadata.health_urgency_max_points || 20,
        enabled: data.metadata.health_urgency_enabled !== false
      };
    }
  } catch {
    // Config row doesn't exist — use defaults
  }
  return { max_points: 20, enabled: true };
}

/**
 * Check if an SD is health-derived (originated from codebase health system).
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if SD was generated from health findings
 */
export function isHealthDerivedSD(sd) {
  if (sd.metadata?.origin === 'codebase_health') return true;
  if (sd.metadata?.source === 'health_scan') return true;

  if (Array.isArray(sd.delivers_capabilities)) {
    for (const cap of sd.delivers_capabilities) {
      if (typeof cap === 'object' && cap.capability_key?.includes('health')) return true;
    }
  }

  const title = (sd.title || '').toLowerCase();
  if (title.includes('health') && (title.includes('degradation') || title.includes('finding'))) {
    return true;
  }

  return false;
}

/**
 * Check health snapshot freshness for sd:next advisory.
 *
 * @param {Object} [supabase] - Supabase client
 * @returns {Promise<{ stale: boolean, message: string, lastScan: string|null, hoursOld: number|null }>}
 */
export async function checkHealthFreshness(supabase) {
  const sb = supabase || getSupabase();

  const { data: latest } = await sb
    .from('codebase_health_snapshots')
    .select('scanned_at')
    .order('scanned_at', { ascending: false })
    .limit(1)
    .single();

  if (!latest) {
    return {
      stale: true,
      message: 'No health snapshots found. Run: npm run health:scan',
      lastScan: null,
      hoursOld: null
    };
  }

  const hoursOld = (Date.now() - new Date(latest.scanned_at).getTime()) / (1000 * 60 * 60);

  if (hoursOld > 24) {
    return {
      stale: true,
      message: `Health snapshots are ${Math.round(hoursOld)}h old. Run: npm run health:scan`,
      lastScan: latest.scanned_at,
      hoursOld: Math.round(hoursOld)
    };
  }

  return {
    stale: false,
    message: `Last health scan: ${Math.round(hoursOld)}h ago`,
    lastScan: latest.scanned_at,
    hoursOld: Math.round(hoursOld)
  };
}

export default {
  buildHealthDataFromSnapshots,
  loadHealthUrgencyConfig,
  isHealthDerivedSD,
  checkHealthFreshness
};
