#!/usr/bin/env node

/**
 * EHG_Engineer Backend API Server
 * SD-ARCH-EHG-007: Backend API + LEO Protocol engine -- customer/chairman-facing
 * product UI stays in the EHG unified frontend at port 8080.
 * RATIFIED NARROW EXCEPTION (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001, chairman-directed
 * 2026-07-22): the fleet-launcher OPERATOR UI (internal-only, not customer-facing)
 * is served from here, because the OS-level primitives it drives (process spawn/
 * attach/kill, window focus, sandboxed CDP browser control) already run server-side
 * in this process -- see server/routes/fleet-sessions.js. This does not generalize
 * to other UI work in this repo.
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
import backlogRoutes from './routes/backlog.js';
import dashboardRoutes from './routes/dashboard.js';
import feedbackRoutes from './routes/feedback.js';
import testingCampaignRoutes from './routes/testing-campaign.js';
import venturesRoutes from './routes/ventures.js';
import v2ApiRoutes from './routes/v2-apis.js';
import chairmanRoutes from './routes/chairman.js';
import evaOperationsRoutes from './routes/eva-operations.js';
import evaPipelineRoutes from './routes/eva-pipeline.js';
import evaExitRoutes from './routes/eva-exit.js';
import evaEconomicLensRoutes from './routes/eva-economic-lens.js';
import stage18Routes from './routes/stage18.js';
import stage19Routes from './routes/stage19.js';
import stage24Routes from './routes/stage24.js';
import githubRepoRoutes from './routes/github-repo.js';
import protocolLintRoutes, { requireAdminRole } from './routes/protocol-lint.js';
import fleetSessionsRoutes from './routes/fleet-sessions.js';
import { createChairmanScopeGuard } from '../lib/middleware/chairman-scope-guard.js';

// Payment webhook handler (SD-FDBK-FIX-BLOCKING-STRIPE-LIVE-001)
import { handleStripeWebhook } from '../api/webhooks/stripe.js';
// Two-way chairman SMS bridge webhooks (SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001)
import { handleTwilioSmsWebhook, handleTwilioStatusCallback } from '../api/webhooks/twilio-sms.js';

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

// Stripe webhook: raw-body middleware MUST run before the global express.json()
// parser below, or signature verification loses the exact bytes it needs
// (SD-FDBK-FIX-BLOCKING-STRIPE-LIVE-001, FR-1). Registered with app.all() (not
// app.post()) so handleStripeWebhook's own method check (405 for non-POST)
// is reachable — app.post() would 404 non-POST requests before the handler
// ever runs.
app.all('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Twilio SMS bridge webhooks: Twilio POSTs application/x-www-form-urlencoded (not
// JSON), and its signature is computed over the PARSED params (not raw bytes), so
// these need express.urlencoded() rather than Stripe's express.raw() — but still
// registered ahead of the global express.json() parser for the same "don't let a
// generic body parser touch a webhook's body before its own middleware" discipline.
app.all('/api/webhooks/twilio-sms', express.urlencoded({ extended: false }), handleTwilioSmsWebhook);
app.all('/api/webhooks/twilio-status', express.urlencoded({ extended: false }), handleTwilioStatusCallback);

app.use(express.json());

// Fleet-launcher operator UI static assets (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B): the
// Session View pane fragment, mountable into the parent shell. See the ARCH-007 exception
// note at the top of this file.
app.use('/fleet-ui', express.static(path.join(PROJECT_ROOT, 'server', 'public', 'fleet-ui')));

// NOTE: /api/webhooks/github-ci-status (api/webhooks/github-ci-status.js) is
// intentionally NOT mounted here. Its ESM/CJS crash and an unauthenticated
// dev-mode bypass were fixed (SD-FDBK-FIX-BLOCKING-STRIPE-LIVE-001), but CI's
// schema-reference-lint + a live-schema probe confirmed the handler's business
// logic references three tables that do not exist in production
// (ci_cd_failure_resolutions, ci_cd_pipeline_status, ci_cd_monitoring_config)
// and three non-existent strategic_directives_v2 columns (ci_cd_status,
// last_pipeline_run, pipeline_health_score) — database/migrations/leo-ci-cd-
// integration.sql defines them but was never applied. Mounting a route whose
// core logic cannot run against the real schema is unsafe; deferred to a
// follow-up once that migration gap is properly resolved.
// =============================================================================
// API ROUTES
// =============================================================================

// Mount route modules with authentication (SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-C)
// SD-LEO-FIX-API-ROUTE-AUTH-001: Tightened auth — requireAuth for routes with mutation endpoints
// optionalAuth: ONLY for truly read-only route modules
// requireAuth: blocks unauthenticated access (any route with POST/PUT/PATCH/DELETE)
app.use('/api/backlog', optionalAuth, backlogRoutes);
app.use('/api/feedback', requireAuth, feedbackRoutes);
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
app.use('/api/eva/pipeline', requireAuth, evaPipelineRoutes);
app.use('/api/eva/exit', requireAuth, evaExitRoutes);
app.use('/api/eva/economic-lens', requireAuth, evaEconomicLensRoutes);
// Stage 17: /api/stage17 routes removed by SD-LEO-REFAC-VERIFY-GVOS-SUPERSESSION-001
// (zero-caller, superseded by the GVOS composer + stage-execution pipeline).
// Stage 18 Marketing Copy Studio
app.use('/api/stage18', requireAuth, stage18Routes);
// Stage 19 Replit Workflow Prompts
app.use('/api/stage19', requireAuth, stage19Routes);
// Stage 24 Go Live
app.use('/api/stage24', requireAuth, stage24Routes);
app.use('/api/github', requireAuth, githubRepoRoutes);
// Protocol Linter Dashboard (SD-PROTOCOL-LINTER-DASHBOARD-001): read-only admin-gated
app.use('/api/admin/protocol-lint', requireAuth, requireAdminRole, protocolLintRoutes);
// Fleet launcher Session View pane (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B): attach-focus +
// sandboxed browser pane control -- OS-level foreground focus, CDP launch, human-pause.
app.use('/api/fleet/sessions', requireAuth, fleetSessionsRoutes);
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

    // Validate artifact type constraints (prevent dual-constraint bug)
    import('../lib/eva/artifact-type-constraint-validator.js').then(({ validateArtifactTypeConstraints }) => {
      const startupSupabase = dbLoader.getClient?.() || require('../lib/supabase-client.js').createSupabaseServiceClient?.();
      if (startupSupabase) validateArtifactTypeConstraints(startupSupabase).catch(() => {});
    }).catch(() => {});
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
