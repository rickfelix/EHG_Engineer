/**
 * Dashboard API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import { dashboardState } from '../state.js';
import { broadcastToClients } from '../websocket.js';

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

// PR Review System
router.get('/pr-reviews', async (req, res) => {
  try {
    const reviews = await dbLoader.loadPRReviews();
    res.json(reviews || []);
  } catch (error) {
    console.error('Error loading PR reviews:', error);
    res.status(500).json({ error: 'Failed to load PR reviews' });
  }
});

router.get('/pr-reviews/metrics', async (req, res) => {
  try {
    const metrics = await dbLoader.calculatePRMetrics();
    res.json(metrics || {
      totalToday: 0,
      passRate: 0,
      avgTime: 0,
      falsePositiveRate: 0,
      complianceRate: 0
    });
  } catch (error) {
    console.error('Error calculating PR metrics:', error);
    res.status(500).json({ error: 'Failed to calculate PR metrics' });
  }
});

// GitHub webhook for PR review updates
router.post('/github/pr-review-webhook', async (req, res) => {
  try {
    const review = req.body;
    console.log('Received PR review webhook:', review.pr_number);

    await dbLoader.savePRReview(review);

    broadcastToClients({
      type: 'pr_review_update',
      data: review
    });

    res.json({ success: true, pr_number: review.pr_number });
  } catch (error) {
    console.error('Error processing PR review webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
