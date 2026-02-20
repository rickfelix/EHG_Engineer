/**
 * Rounds Scheduler
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-002: FR-002
 *
 * Implements the "Rounds" scheduling mode from the EVA architecture:
 * periodic batch operations that run on a cadence (vs Events for urgent,
 * Priority Queue for planned work).
 *
 * Round types are registered with handler functions. The scheduler
 * executes them on demand via CLI or programmatically.
 */

const roundRegistry = new Map();

/**
 * Register a round type with its handler.
 * @param {string} roundType - Unique round type name (e.g., 'vision_rescore')
 * @param {Object} config
 * @param {string} config.description - Human-readable description
 * @param {Function} config.handler - async function(options) => result
 * @param {string} [config.cadence] - Suggested cadence (e.g., 'daily', 'weekly')
 */
export function registerRound(roundType, config) {
  if (!roundType || !config?.handler) {
    throw new Error('roundType and config.handler are required');
  }

  roundRegistry.set(roundType, {
    type: roundType,
    description: config.description || '',
    handler: config.handler,
    cadence: config.cadence || 'on_demand',
    registeredAt: new Date().toISOString(),
  });
}

/**
 * Execute a registered round.
 * @param {string} roundType - Round type to execute
 * @param {Object} [options] - Options passed to the handler
 * @returns {Promise<Object>} Execution result with timing
 */
export async function runRound(roundType, options = {}) {
  const round = roundRegistry.get(roundType);
  if (!round) {
    throw new Error(`Round type '${roundType}' not registered. Available: ${listRounds().map(r => r.type).join(', ')}`);
  }

  const startTime = Date.now();
  console.log(`\n🔄 Round: ${roundType}`);
  console.log(`   Description: ${round.description}`);

  try {
    const result = await round.handler(options);
    const latencyMs = Date.now() - startTime;

    console.log(`   ✅ Completed in ${latencyMs}ms`);

    return {
      roundType,
      success: true,
      result,
      latencyMs,
      executedAt: new Date().toISOString(),
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    console.error(`   ❌ Failed after ${latencyMs}ms: ${err.message}`);

    return {
      roundType,
      success: false,
      error: err.message,
      latencyMs,
      executedAt: new Date().toISOString(),
    };
  }
}

/**
 * List all registered rounds.
 * @returns {Array<Object>} Registered round configurations
 */
export function listRounds() {
  return Array.from(roundRegistry.values()).map(r => ({
    type: r.type,
    description: r.description,
    cadence: r.cadence,
    registeredAt: r.registeredAt,
  }));
}

// ── Default Round Types ──────────────────────────────────────────────────────

registerRound('vision_rescore', {
  description: 'Rescore portfolio vision alignment via inline Claude Code evaluation',
  cadence: 'weekly',
  handler: async (options = {}) => {
    const { createVisionGovernanceService } = await import('./vision-governance-service.js');
    const service = createVisionGovernanceService();
    const latest = await service.getLatestScore();
    return {
      action: 'rescore_needed',
      lastScore: latest?.total_score || null,
      lastScoredAt: latest?.scored_at || null,
      instruction: 'Run: node scripts/eva/vision-heal.js score',
    };
  },
});

registerRound('gap_analysis', {
  description: 'Analyze open vision gaps and check for corrective SD progress',
  cadence: 'weekly',
  handler: async () => {
    const { createVisionGovernanceService } = await import('./vision-governance-service.js');
    const service = createVisionGovernanceService();
    const [gaps, correctives] = await Promise.all([
      service.getGaps(),
      service.getActiveCorrectiveSDs(),
    ]);
    return {
      openGaps: gaps.length,
      activeCorrectiveSDs: correctives.length,
      gaps: gaps.slice(0, 5),
      correctives: correctives.slice(0, 5),
    };
  },
});

registerRound('stage_health', {
  description: 'Check stage template completeness across all 25 lifecycle stages',
  cadence: 'monthly',
  handler: async () => {
    const { readdirSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const templatesDir = join(__dirname, 'stage-templates');

    const files = readdirSync(templatesDir).filter(f => f.match(/^stage-\d{2}\.js$/));
    const found = files.map(f => parseInt(f.match(/stage-(\d{2})/)[1]));
    const missing = [];
    for (let i = 1; i <= 25; i++) {
      if (!found.includes(i)) missing.push(i);
    }

    return {
      totalStages: 25,
      templatesFound: found.length,
      templatesMissing: missing.length,
      found: found.sort((a, b) => a - b),
      missing,
    };
  },
});

registerRound('corrective_generation', {
  description: 'Generate corrective SDs from latest vision score gaps',
  cadence: 'weekly',
  handler: async () => {
    const { createVisionGovernanceService } = await import('./vision-governance-service.js');
    const service = createVisionGovernanceService();
    const latest = await service.getLatestScore();

    if (!latest) {
      return { action: 'no_scores', message: 'No vision scores found. Run eva:heal score first.' };
    }

    if (latest.threshold_action === 'accept') {
      return { action: 'accept', score: latest.total_score, message: 'All dimensions pass. No correctives needed.' };
    }

    const result = await service.generateCorrectiveSDs(latest.id);
    return {
      action: result.created ? 'created' : 'deferred',
      scoreId: latest.id,
      totalScore: latest.total_score,
      ...result,
    };
  },
});
