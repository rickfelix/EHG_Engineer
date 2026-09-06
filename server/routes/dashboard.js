/**
 * Dashboard API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import { dashboardState } from '../state.js';

const router = Router();

// Status endpoint
router.get('/status', (req, res) => {
  res.json({
    leoProtocol: dashboardState.leoProtocol,
    context: dashboardState.context,
    progress: dashboardState.progress,
    application: dashboardState.application
  });
});

// Full state endpoint
router.get('/state', (req, res) => {
  res.json(dashboardState);
});

// Strategic Directives
router.get('/sd', (req, res) => {
  res.json(dashboardState.strategicDirectives);
});

router.get('/sd/:id', async (req, res) => {
  const sd = dashboardState.strategicDirectives.find(s => s.id === req.params.id);
  if (sd) {
    res.json(sd);
  } else {
    res.status(404).json({ error: 'Strategic Directive not found' });
  }
});

// Product Requirements Documents
router.get('/prd', (req, res) => {
  res.json(dashboardState.prds);
});

router.get('/prd/:id', (req, res) => {
  const prd = dashboardState.prds.find(p => p.id === req.params.id);
  if (prd) {
    res.json(prd);
  } else {
    res.status(404).json({ error: 'PRD not found' });
  }
});

// PR Review System retired (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-A): pr_reviews had no
// CREATE TABLE anywhere in the repo's history -- these 3 routes (GET /pr-reviews,
// GET /pr-reviews/metrics, POST /github/pr-review-webhook) were reachable via
// app.use('/api', optionalAuth, dashboardRoutes) (effectively public, since optionalAuth
// does not reject unauthenticated callers) and silently swallowed every query error into
// an empty/null response. No evidence this feature's database layer was ever built.

export default router;
