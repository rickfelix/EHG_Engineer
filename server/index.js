#!/usr/bin/env node

/**
 * EHG_Engineer Backend API Server
 * SD-ARCH-EHG-007: Backend API + LEO Protocol engine (no standalone UI)
 * All UI is in EHG unified frontend at port 8080
 *
 * REFACTORED: This file now orchestrates modular components.
 * Original 2707 LOC split into focused modules (~100-400 LOC each):
 * - server/config.js: Configuration and initialization
 * - server/state.js: State management
 * - server/websocket.js: WebSocket handling
 * - server/routes/: API route modules
 *
 * SD-LEO-REFACTOR-SERVER-001: Refactor server.js from 2707 LOC
 */

import express from 'express';
import http from 'http';
import path from 'path';
// fs removed - no longer used in main entry point
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import chokidar from 'chokidar';

// Import configuration and services
import {
  PORT,
  PROJECT_ROOT,
  dbLoader,
  realtimeDashboard,
  initializeOpenAI
} from './config.js';

// Import state management
import { loadState, dashboardState } from './state.js';

// Import WebSocket handler
import { initializeWebSocket, broadcastUpdate } from './websocket.js';

// Import route modules
import sdipRoutes from './routes/sdip.js';
import backlogRoutes from './routes/backlog.js';
import dashboardRoutes from './routes/dashboard.js';
import feedbackRoutes from './routes/feedback.js';
import discoveryRoutes from './routes/discovery.js';
import calibrationRoutes from './routes/calibration.js';
import testingCampaignRoutes from './routes/testing-campaign.js';
import venturesRoutes from './routes/ventures.js';
import v2ApiRoutes from './routes/v2-apis.js';
import chairmanRoutes from './routes/chairman.js';
import evaOperationsRoutes from './routes/eva-operations.js';
import evaLaunchRoutes from './routes/eva-launch.js';
import evaPipelineRoutes from './routes/eva-pipeline.js';
import evaExitRoutes from './routes/eva-exit.js';
import evaChatRoutes from './routes/eva-chat.js';
import evaEconomicLensRoutes from './routes/eva-economic-lens.js';
import stitchRoutes from './routes/stitch.js';
import { createChairmanScopeGuard } from '../lib/middleware/chairman-scope-guard.js';
import { resumeIncompleteArchetypeJobs } from '../lib/eva/stage-17/auto-resume.js';

// Import Story API
import * as storiesAPI from '../src/api/stories.js';

// Import RefreshAPI
import RefreshAPI from '../src/services/refresh-api.js';

// Import RCA Monitor Bootstrap (SD-RCA-001)
import { bootstrapRCAMonitoring, registerRCAShutdownHandlers } from '../lib/rca-monitor-bootstrap.js';

// Import EVA Error Handler
import { createEvaErrorHandler } from '../lib/middleware/eva-error-handler.js';

// Import Authentication Middleware (SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-C)
import { requireAuth, optionalAuth } from './middleware/auth.js';

// Import Story Agent Bootstrap
import StoryAgentBootstrap from '../src/agents/story-bootstrap.js';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// Initialize OpenAI
initializeOpenAI();

// Initialize RefreshAPI
const refreshAPI = new RefreshAPI(server, dbLoader);

// =============================================================================
// MIDDLEWARE
// =============================================================================

// SD-ARCH-EHG-007: Configure CORS for EHG unified frontend access
app.use(cors({
  origin: [
    'http://localhost:8080',  // EHG unified frontend (Vite)
    'http://localhost:8081',  // EHG fallback port
    /^https:\/\/.*\.ehg\.com$/  // Production EHG domains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Security headers (SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-E)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'ws://localhost:*', 'wss://localhost:*'],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin API calls from frontend
}));

// Rate limiting (SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-E)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Rate limit exceeded. Try again later.', code: 'RATE_LIMITED' },
});
app.use('/api', apiLimiter);

app.use(express.json());

// =============================================================================
// API ROUTES
// =============================================================================

// Mount route modules with authentication (SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-C)
// SD-LEO-FIX-API-ROUTE-AUTH-001: Tightened auth — requireAuth for routes with mutation endpoints
// optionalAuth: ONLY for truly read-only route modules
// requireAuth: blocks unauthenticated access (any route with POST/PUT/PATCH/DELETE)
app.use('/api/sdip', requireAuth, sdipRoutes);
app.use('/api/backlog', optionalAuth, backlogRoutes);
app.use('/api/feedback', requireAuth, feedbackRoutes);
app.use('/api/discovery', requireAuth, discoveryRoutes);
app.use('/api/blueprints', optionalAuth, discoveryRoutes);
app.use('/api/calibration', requireAuth, calibrationRoutes);
app.use('/api/testing/campaign', requireAuth, testingCampaignRoutes);
app.use('/api/ventures', (req, res, next) => {
  // Master reset uses service-role client internally — auth at RPC level (chairman check)
  if (req.method === 'POST' && req.path === '/master-reset') return optionalAuth(req, res, next);
  return requireAuth(req, res, next);
}, venturesRoutes);
app.use('/api/competitor-analysis', requireAuth, venturesRoutes);
app.use('/api/v2', requireAuth, v2ApiRoutes);
app.use('/api/chairman', requireAuth, createChairmanScopeGuard({ blocking: true }), chairmanRoutes);
app.use('/api/eva/operations', requireAuth, evaOperationsRoutes);
app.use('/api/eva/launch', requireAuth, evaLaunchRoutes);
app.use('/api/eva/pipeline', requireAuth, evaPipelineRoutes);
app.use('/api/eva/exit', requireAuth, evaExitRoutes);
app.use('/api/eva/chat', requireAuth, evaChatRoutes);
app.use('/api/eva/economic-lens', requireAuth, evaEconomicLensRoutes);
// Stitch design export — chairman-initiated, requires auth
// SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-B
app.use('/api/stitch', requireAuth, stitchRoutes);
// Dashboard routes: read-only, optional auth
app.use('/api', optionalAuth, dashboardRoutes);

// Story API Routes (with auth)
app.post('/api/stories/generate', requireAuth, storiesAPI.generate);
app.get('/api/stories', optionalAuth, storiesAPI.list);
app.post('/api/stories/verify', requireAuth, storiesAPI.verify);
app.get('/api/stories/gate', optionalAuth, storiesAPI.releaseGate);
app.get('/api/stories/health', storiesAPI.health);

// =============================================================================
// REFRESH HANDLER
// =============================================================================

const refreshHandler = async () => {
  if (dbLoader.isConnected) {
    console.log('📊 Refreshing dashboard state from database...');

    const newPRDs = await dbLoader.loadPRDs();
    const newSDs = await dbLoader.loadStrategicDirectives();
    const newEES = await dbLoader.loadExecutionSequences();

    dashboardState.prds = newPRDs;
    dashboardState.strategicDirectives = newSDs;
    dashboardState.executionSequences = newEES;
    dashboardState.lastRefresh = new Date().toISOString();

    console.log(`✅ Dashboard state updated: ${newSDs.length} SDs, ${newPRDs.length} PRDs, ${newEES.length} EES`);

    broadcastUpdate('state', dashboardState);

    return {
      sds: newSDs.length,
      prds: newPRDs.length,
      ees: newEES.length
    };
  }
  throw new Error('Database not connected');
};

refreshAPI.refreshHandler = refreshHandler;
refreshAPI.setupRoutes(app);

// =============================================================================
// FILE WATCHING (Development)
// =============================================================================

if (process.env.NODE_ENV !== 'production') {
  const watcher = chokidar.watch([
    path.join(PROJECT_ROOT, '.leo-status.json'),
    path.join(PROJECT_ROOT, '.leo-context-state.json'),
    path.join(PROJECT_ROOT, 'docs/strategic-directives'),
    path.join(PROJECT_ROOT, 'docs/prds')
  ], {
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', async (filepath) => {
    console.log(`📝 File changed: ${path.basename(filepath)}`);
    await loadState(broadcastUpdate);
    broadcastUpdate('fileChange', { file: filepath });
  });
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================
// Handled by realtimeDashboard in server/state.js — no duplicate subscriptions

// =============================================================================
// EVA ERROR HANDLER
// =============================================================================

const evaErrorHandler = createEvaErrorHandler({
  supabase: dbLoader?.supabase || null
});

app.use(evaErrorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  await loadState(broadcastUpdate);

  // Initialize STORY agent if enabled
  if (process.env.FEATURE_STORY_AGENT === 'true') {
    const storyBootstrap = new StoryAgentBootstrap();
    await storyBootstrap.initialize();
    console.log('🎯 STORY Agent initialized');
  }

  // Initialize RCA runtime monitoring (SD-RCA-001)
  await bootstrapRCAMonitoring();
  registerRCAShutdownHandlers();

  server.listen(PORT, '127.0.0.1', () => {
    console.log('\n=============================================================');
    console.log('🚀 EHG_Engineer Unified Application Server');
    console.log('=============================================================');
    console.log(`📍 Local:            http://localhost:${PORT}`);
    console.log('🔒 Bind:             127.0.0.1 (localhost only)');
    console.log(`📊 Dashboard:        http://localhost:${PORT}/dashboard`);
    console.log('🎙️  EVA Voice:       http://localhost:8080/eva-assistant (EHG App) ✅');
    console.log('-------------------------------------------------------------');
    console.log(`✅ Database:        ${dbLoader.isConnected ? 'Connected' : 'Not connected'}`);
    console.log(`📋 LEO Protocol:    ${dashboardState.leoProtocol.version}`);
    console.log(`🔍 Strategic Dirs:  ${dashboardState.strategicDirectives.length} loaded`);
    console.log(`📄 PRDs:            ${dashboardState.prds.length} loaded`);
    console.log(`⚡ Realtime:        ${realtimeDashboard.isConnected ? 'Active' : 'Inactive'}`);
    console.log('=============================================================\n');

    const sd2025 = dashboardState.strategicDirectives.find(sd => sd.id === 'SD-2025-001');
    if (sd2025) {
      console.log('✨ SD-2025-001 (OpenAI Realtime Voice) is loaded and ready!');
    }

    // S17 archetype generation auto-resume on startup
    // SD-S17-ARCHETYPE-GENERATION-RESILIENCE-ORCH-001-A
    resumeIncompleteArchetypeJobs().catch(err =>
      console.error('[startup] Auto-resume scan failed:', err.message)
    );
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Export for testing
export { app, server };
