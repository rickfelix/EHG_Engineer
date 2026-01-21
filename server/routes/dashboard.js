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

// Get PRD by SD ID (v3)
router.get('/prd-v3/:sd_id', async (req, res) => {
  try {
    const { sd_id } = req.params;
    const { format = 'json' } = req.query;

    const { data: prd, error } = await dbLoader.supabase
      .from('product_requirements_v3')
      .select('*')
      .eq('sd_id', sd_id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'PRD not found for this SD' });
      }
      throw error;
    }

    if (format === 'md') {
      res.type('text/markdown').send(prd.content_md);
    } else {
      res.json({
        prd_id: prd.prd_id,
        sd_id: prd.sd_id,
        version: prd.version,
        status: prd.status,
        content_json: prd.content_json,
        generated_at: prd.generated_at,
        metadata: {
          import_run_id: prd.import_run_id,
          notes: prd.notes
        }
      });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execution Sequences
router.get('/ees', (req, res) => {
  res.json(dashboardState.executionSequences || []);
});

// Context management
router.get('/context', (req, res) => {
  res.json(dashboardState.context);
});

// Progress tracking
router.get('/progress', (req, res) => {
  res.json(dashboardState.progress);
});

// Handoffs
router.get('/handoff', (req, res) => {
  res.json(dashboardState.handoffs);
});

// Mock metrics endpoint (for backward compatibility)
router.get('/metrics', (req, res) => {
  res.json({
    tests: { total: 0, passed: 0, failed: 0 },
    coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
    git: { branch: 'main', uncommittedChanges: 0, lastCommit: '' }
  });
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

// EVA Voice Assistant status
router.get('/eva/status', (req, res) => {
  res.json({
    enabled: dashboardState.application.features.voiceAssistant,
    message: 'EVA Voice Assistant will be implemented with OpenAI Realtime API'
  });
});

// Integrity Metrics
router.get('/integrity-metrics', async (req, res) => {
  try {
    const { data: backlogMetrics, error: backlogError } = await dbLoader.supabase
      .from('integrity_metrics')
      .select('*')
      .eq('source', 'backlog-integrity')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: ideationMetrics, error: ideationError } = await dbLoader.supabase
      .from('integrity_metrics')
      .select('*')
      .eq('source', 'vh-ideation')
      .order('created_at', { ascending: false })
      .limit(10);

    if (backlogError) throw backlogError;
    if (ideationError) throw ideationError;

    res.json({
      backlog: backlogMetrics || [],
      ideation: ideationMetrics || []
    });
  } catch (error) {
    console.error('Error loading integrity metrics:', error);
    res.status(500).json({ error: 'Failed to load integrity metrics' });
  }
});

export default router;
