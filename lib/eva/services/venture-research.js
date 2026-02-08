/**
 * Venture Research Service (CLI Port)
 *
 * SD-LEO-FEAT-SERVICE-PORTS-001
 * CLI-compatible port of ehg/src/services/ventureResearch.ts
 *
 * Differences from frontend:
 * - Uses process.env instead of import.meta.env
 * - Uses Node 18+ global fetch (no browser dependency)
 * - Mock sessions use in-memory Map (same as frontend)
 * - All functions accept optional deps for DI/testing
 *
 * @module lib/eva/services/venture-research
 */

const DEFAULT_API_URL = 'http://localhost:8000/api/research';
const DEFAULT_HEALTH_URL = 'http://localhost:8000/health';

// In-memory mock session store for progress simulation
const mockSessions = new Map();

/**
 * Verify Agent Platform backend connectivity.
 *
 * @param {Object} [deps]
 * @param {string} [deps.apiUrl] - Override API URL
 * @param {string} [deps.healthUrl] - Override health check URL
 * @param {boolean} [deps.useMock] - Force mock mode
 * @returns {Promise<{available: boolean, error?: string}>}
 */
export async function verifyBackendConnection(deps = {}) {
  const healthUrl = deps.healthUrl || process.env.AGENT_PLATFORM_HEALTH_URL || DEFAULT_HEALTH_URL;
  const useMock = deps.useMock ?? (process.env.MOCK_RESEARCH === 'true');

  if (useMock) {
    return { available: false, error: 'Mock mode enabled (MOCK_RESEARCH=true)' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { available: true };
    }
    return {
      available: false,
      error: `Backend returned status ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { available: false, error: 'Connection timeout (5s)' };
      }
      return { available: false, error: error.message };
    }
    return { available: false, error: 'Unknown connection error' };
  }
}

/**
 * Create a new research session via Agent Platform API.
 *
 * @param {Object} request - { venture_id, session_type, scope?, priority?, user_context? }
 * @param {Object} [deps]
 * @param {string} [deps.apiUrl] - Override API URL
 * @param {boolean} [deps.useMock] - Force mock mode
 * @param {Object} [deps.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} ResearchSession
 */
export async function createResearchSession(request, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.AGENT_PLATFORM_API_URL || DEFAULT_API_URL;
  const useMock = deps.useMock ?? (process.env.MOCK_RESEARCH === 'true');
  const logger = deps.logger || console;

  if (useMock) {
    logger.info?.('[VentureResearch] Mock mode - generating mock session');
    return generateMockSession(request);
  }

  try {
    const response = await fetch(`${apiUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (response.status === 501) {
      throw new Error('Agent Platform research endpoints not fully implemented (HTTP 501)');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to create research session' }));
      throw new Error(err.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to Agent Platform backend on port 8000');
    }
    throw error;
  }
}

/**
 * Get research session by ID (supports mock sessions).
 *
 * @param {string} sessionId
 * @param {Object} [deps]
 * @param {string} [deps.apiUrl] - Override API URL
 * @returns {Promise<Object>} ResearchSession
 */
export async function getResearchSession(sessionId, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.AGENT_PLATFORM_API_URL || DEFAULT_API_URL;

  if (sessionId.startsWith('mock-')) {
    const mockData = mockSessions.get(sessionId);
    if (mockData) {
      return simulateMockProgress(mockData);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${apiUrl}/sessions/${sessionId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to fetch research session' }));
      throw new Error(err.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.results_summary) {
      data.results_summary = normalizeResearchResults(data.results_summary);
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * List research sessions for a venture.
 *
 * @param {string} ventureId
 * @param {Object} [deps]
 * @param {string} [deps.apiUrl] - Override API URL
 * @returns {Promise<Object[]>}
 */
export async function listResearchSessions(ventureId, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.AGENT_PLATFORM_API_URL || DEFAULT_API_URL;
  const params = new URLSearchParams({ venture_id: ventureId });

  const response = await fetch(`${apiUrl}/sessions?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to list research sessions' }));
    throw new Error(err.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Poll for research session completion.
 *
 * @param {string} sessionId
 * @param {Object} [options]
 * @param {number} [options.interval=5000] - Polling interval in ms
 * @param {number} [options.maxAttempts=300] - Max polling attempts
 * @param {Function} [options.onProgress] - Progress callback
 * @param {Object} [deps]
 * @returns {Promise<Object>} Completed ResearchSession
 */
export async function pollResearchSession(sessionId, options = {}, deps = {}) {
  const { interval = 5000, maxAttempts = 300, onProgress } = options;

  await new Promise(resolve => setTimeout(resolve, 500));

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const session = await getResearchSession(sessionId, deps);

      if (session && onProgress) {
        onProgress(session);
      }

      if (session?.status === 'completed') {
        return session;
      }

      if (session?.status === 'failed') {
        throw new Error('Research session failed');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Timeout on this poll, continue
      } else if (error.message === 'Research session failed') {
        throw error;
      }
      // Other errors: continue polling
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Research session polling timed out');
}

/**
 * Create session and poll until completion.
 *
 * @param {Object} request
 * @param {Function} [onProgress]
 * @param {Object} [deps]
 * @returns {Promise<Object>}
 */
export async function runResearch(request, onProgress, deps = {}) {
  const session = await createResearchSession(request, deps);
  return pollResearchSession(session.id, {
    interval: 2000,
    maxAttempts: 600,
    onProgress,
  }, deps);
}

/**
 * Get latest research session for a venture.
 *
 * @param {string} ventureId
 * @param {Object} [deps]
 * @returns {Promise<Object|null>}
 */
export async function getLatestResearchSession(ventureId, deps = {}) {
  const sessions = await listResearchSessions(ventureId, deps);
  if (sessions.length === 0) return null;

  sessions.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sessions[0];
}

/**
 * Explicitly create a mock research session.
 *
 * @param {Object} request
 * @returns {Object}
 */
export function createMockResearchSession(request) {
  return generateMockSession(request);
}

// ── Internal Helpers ────────────────────────────────────────────

function generateMockSession(request) {
  const sessionId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const session = {
    id: sessionId,
    venture_id: request.venture_id,
    session_type: request.session_type,
    status: 'pending',
    progress: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    estimated_completion: new Date(Date.now() + 30000).toISOString(),
    results_summary: buildMockResults(),
    activity_log: buildMockActivityLog(now),
  };

  mockSessions.set(sessionId, { startTime: Date.now(), session });
  return session;
}

function simulateMockProgress(mockData) {
  const { startTime, session } = mockData;
  const elapsed = Date.now() - startTime;
  const progress = Math.min(100, Math.floor((elapsed / 30000) * 100));

  const activityLog = [];
  if (progress > 0) activityLog.push({ timestamp: new Date(startTime).toISOString(), event_type: 'info', message: 'Research session started' });
  if (progress >= 25) activityLog.push({ timestamp: new Date(startTime + 7500).toISOString(), event_type: 'agent_complete', message: 'Market Sizing Agent completed' });
  if (progress >= 50) activityLog.push({ timestamp: new Date(startTime + 15000).toISOString(), event_type: 'agent_complete', message: 'Pain Point Agent completed' });
  if (progress >= 75) activityLog.push({ timestamp: new Date(startTime + 22500).toISOString(), event_type: 'agent_complete', message: 'Competitive Analysis Agent completed' });
  if (progress >= 100) activityLog.push({ timestamp: new Date(startTime + 30000).toISOString(), event_type: 'agent_complete', message: 'Strategic Fit Agent completed' });

  return {
    ...session,
    progress,
    status: progress >= 100 ? 'completed' : 'running',
    updated_at: new Date().toISOString(),
    activity_log: activityLog,
  };
}

function buildMockResults() {
  return {
    market_sizing: {
      tam: 5_000_000_000,
      sam: 1_000_000_000,
      som: 50_000_000,
      confidence: 0.82,
      sources: ['Industry analysis reports', 'Market databases', 'Competitor financials'],
    },
    pain_point: {
      severity_score: 8,
      frequency_score: 9,
      urgency_score: 7,
      top_pain_points: [
        { description: 'High customer acquisition costs', evidence: ['Industry surveys', 'Forum discussions'] },
        { description: 'Lack of integrated analytics', evidence: ['Customer reviews', 'Product feedback'] },
      ],
    },
    competitive: {
      intensity: 7,
      competitors: [
        { name: 'MarketLeader Pro', strengths: ['Established brand'], weaknesses: ['Complex UI'] },
        { name: 'QuickAnalytics', strengths: ['Simple interface'], weaknesses: ['Limited features'] },
      ],
      moat_opportunities: ['Focus on mid-market', 'Superior UX', 'AI-powered insights'],
    },
    strategic_fit: {
      alignment_score: 8,
      risks: ['Competitive market', 'Customer switching costs'],
      opportunities: ['Growing demand (23% CAGR)', 'Underserved mid-market'],
      recommendation: { fit_tier: 'STRONG_FIT', action_items: ['Validate PMF with beta customers'], priority_actions: ['Secure funding'] },
    },
  };
}

function buildMockActivityLog(now) {
  const base = now.getTime();
  return [
    { timestamp: new Date(base - 8000).toISOString(), event_type: 'info', message: 'Research session started (mock data)' },
    { timestamp: new Date(base - 5000).toISOString(), event_type: 'agent_complete', message: 'Market Sizing Agent completed' },
    { timestamp: new Date(base - 3000).toISOString(), event_type: 'agent_complete', message: 'Customer Insights Agent completed' },
    { timestamp: new Date(base - 1500).toISOString(), event_type: 'agent_complete', message: 'Competitive Analysis Agent completed' },
    { timestamp: now.toISOString(), event_type: 'info', message: 'All research agents completed successfully' },
  ];
}

/**
 * Normalize backend research results to standard shape.
 */
function normalizeResearchResults(raw) {
  if (!raw || typeof raw !== 'object') return {};

  const normalized = {};

  if (raw.market_sizing) {
    const ms = raw.market_sizing;
    const marketSize = ms.market_size || {};
    normalized.market_sizing = {
      tam: marketSize.tam ?? ms.tam ?? null,
      sam: marketSize.sam ?? ms.sam ?? null,
      som: marketSize.som ?? ms.som ?? null,
      confidence: ms.confidence ?? 0,
      sources: ms.sources ?? [],
    };
  }

  if (raw.pain_point) {
    normalized.pain_point = raw.pain_point;
  }

  if (raw.competitive) {
    const comp = raw.competitive;
    const metrics = comp.competitive_metrics || {};
    const intensityMap = { LOW: 3, MEDIUM: 6, HIGH: 9 };
    const intensityRaw = metrics.competitive_intensity || comp.intensity;
    const intensity = typeof intensityRaw === 'string'
      ? intensityMap[intensityRaw] ?? 6
      : intensityRaw;

    normalized.competitive = {
      intensity: intensity ?? 0,
      competitors: comp.competitors ?? [],
      moat_opportunities: comp.moat_opportunities ?? [],
    };
  }

  if (raw.strategic_fit) {
    const sf = raw.strategic_fit;
    const fitMetrics = sf.fit_metrics || {};
    const risksObj = sf.risks || {};

    const extractRisks = (risks) => {
      if (Array.isArray(risks)) return risks;
      if (typeof risks === 'object' && risks !== null) {
        const arr = [];
        if (risks.overall_risk) arr.push(`Overall risk: ${risks.overall_risk}`);
        if (risks.resource_risk) arr.push(`Resource risk: ${risks.resource_risk}`);
        if (risks.expertise_risk) arr.push(`Expertise risk: ${risks.expertise_risk}`);
        return arr;
      }
      return [];
    };

    normalized.strategic_fit = {
      alignment_score: sf.alignment_score ?? fitMetrics.strategic_fit_score ?? 0,
      risks: extractRisks(risksObj),
      opportunities: sf.opportunities ?? [],
      recommendation: sf.recommendation ?? '',
    };
  }

  return normalized;
}

// ── Exports for testing ─────────────────────────────────────────

export const _internal = {
  mockSessions,
  generateMockSession,
  simulateMockProgress,
  normalizeResearchResults,
};
