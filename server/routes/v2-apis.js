/**
 * V2 API Routes (Venture-scoped + Feature APIs)
 * SOVEREIGN PIPE v3.7.0: Venture-scoped routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';

// Import API modules
import * as namingEngineAPI from '../../src/api/naming-engine/index.js';
import * as financialEngineAPI from '../../src/api/financial-engine/index.js';
import * as contentForgeAPI from '../../src/api/content-forge/index.js';

const router = Router();

// =============================================================================
// SD-NAMING-ENGINE-001: Naming Engine API Routes
// =============================================================================

/**
 * Generate venture name suggestions
 * POST /api/v2/naming-engine/generate
 */
router.post('/naming-engine/generate', asyncHandler(namingEngineAPI.generateNames));

/**
 * Get saved name suggestions for a brand genome
 * GET /api/v2/naming-engine/suggestions/:brand_genome_id
 */
router.get('/naming-engine/suggestions/:brand_genome_id', asyncHandler(namingEngineAPI.getSuggestions));

// =============================================================================
// SD-FINANCIAL-ENGINE-001: Financial Engine API Routes
// =============================================================================

/**
 * Create financial projection
 * POST /api/v2/financial-engine/project
 */
router.post('/financial-engine/project', asyncHandler(financialEngineAPI.createProjection));

/**
 * Get financial projection by model ID
 * GET /api/v2/financial-engine/:id
 */
router.get('/financial-engine/:id', asyncHandler(financialEngineAPI.getProjection));

/**
 * Create scenario for a model
 * POST /api/v2/financial-engine/:id/scenario
 */
router.post('/financial-engine/:id/scenario', asyncHandler(financialEngineAPI.createScenario));

/**
 * Export financial model to Excel
 * GET /api/v2/financial-engine/:id/export
 */
router.get('/financial-engine/:id/export', asyncHandler(financialEngineAPI.exportToExcel));

/**
 * List financial models for a venture
 * GET /api/v2/financial-engine/list/:venture_id
 */
router.get('/financial-engine/list/:venture_id', asyncHandler(financialEngineAPI.listModels));

// =============================================================================
// SD-CONTENT-FORGE-IMPL-001: Content Forge API Routes
// =============================================================================

/**
 * Generate marketing content using LLM
 * POST /api/v2/content-forge/generate
 */
router.post('/content-forge/generate', asyncHandler(contentForgeAPI.generateContent));

/**
 * List generated content with filters
 * GET /api/v2/content-forge/list
 */
router.get('/content-forge/list', asyncHandler(contentForgeAPI.listContent));

/**
 * Check content compliance
 * POST /api/v2/content-forge/compliance-check
 */
router.post('/content-forge/compliance-check', asyncHandler(contentForgeAPI.checkContentCompliance));

/**
 * Get brand genome by ID
 * GET /api/v2/brand-genome/:id
 */
router.get('/brand-genome/:id', asyncHandler(contentForgeAPI.getBrandGenome));

export default router;
