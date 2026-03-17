/**
 * AI Opportunity Discovery API Routes
 * SD: AI-Generated Venture Idea Discovery
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import { isValidUuid, validateUuidParam, isValidStringLength, isValidEnum } from '../middleware/validate.js';

const router = Router();

// Lazy-load discovery service (avoid startup cost if not used)
let _discoveryService = null;
async function getDiscoveryService() {
  if (!_discoveryService) {
    const { default: OpportunityDiscoveryService } = await import('../../lib/discovery/opportunity-discovery-service.js');
    _discoveryService = new OpportunityDiscoveryService();
  }
  return _discoveryService;
}

/**
 * POST /api/discovery/scan
 * Trigger a new opportunity discovery scan
 */
router.post('/scan', async (req, res) => {
  try {
    const { scan_type, target_url, target_market } = req.body;

    if (!scan_type || !isValidStringLength(scan_type, 50)) {
      return res.status(400).json({ error: 'scan_type is required and must be under 50 characters' });
    }

    if (scan_type === 'competitor' && !target_url) {
      return res.status(400).json({ error: 'target_url is required for competitor scans' });
    }

    // SD-LEO-FIX-API-ROUTE-AUTH-001: Validate URL format
    if (target_url) {
      try { new URL(target_url); } catch { return res.status(400).json({ error: 'target_url must be a valid URL' }); }
    }
    if (target_market && !isValidStringLength(target_market, 500)) {
      return res.status(400).json({ error: 'target_market must be under 500 characters' });
    }

    const discoveryService = await getDiscoveryService();
    const result = await discoveryService.runScan({
      scanType: scan_type,
      targetUrl: target_url,
      targetMarket: target_market,
      initiatedBy: 'chairman'
    });

    res.json(result);
  } catch (error) {
    console.error('Discovery scan error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/discovery/opportunities
 * Get AI-generated opportunities with filtering
 */
router.get('/opportunities', async (req, res) => {
  try {
    const { box, status, minScore, scanId } = req.query;

    const discoveryService = await getDiscoveryService();
    const opportunities = await discoveryService.getOpportunities({
      box,
      status,
      minScore: minScore ? parseInt(minScore) : undefined,
      scanId
    });

    res.json({ opportunities, count: opportunities.length });
  } catch (error) {
    console.error('Get opportunities error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/discovery/scans
 * Get recent discovery scans
 */
router.get('/scans', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const discoveryService = await getDiscoveryService();
    const scans = await discoveryService.getRecentScans(parseInt(limit));

    res.json({ scans, count: scans.length });
  } catch (error) {
    console.error('Get scans error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/discovery/decision
 * Chairman approve/reject an AI-generated blueprint
 */
router.post('/decision', async (req, res) => {
  try {
    const { blueprint_id, decision, feedback } = req.body;

    if (!blueprint_id || !isValidUuid(blueprint_id)) {
      return res.status(400).json({ error: 'blueprint_id is required and must be a valid UUID' });
    }

    if (!decision) {
      return res.status(400).json({ error: 'decision is required' });
    }

    // SD-LEO-FIX-API-ROUTE-AUTH-001: Validate feedback length
    if (feedback && !isValidStringLength(feedback, 5000)) {
      return res.status(400).json({ error: 'feedback must be under 5000 characters' });
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }

    const discoveryService = await getDiscoveryService();
    const result = await discoveryService.chairmanDecision(blueprint_id, decision, feedback);

    res.json({ success: true, blueprint: result });
  } catch (error) {
    console.error('Chairman decision error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/blueprints
 * Get opportunity blueprints with filtering
 */
router.get('/blueprints', async (req, res) => {
  try {
    const { source, box, status, limit = 50 } = req.query;

    let query = dbLoader.supabase
      .from('opportunity_blueprints')
      .select('*')
      .eq('is_active', true);

    if (source && source !== 'all') {
      query = query.eq('source_type', source);
    }
    if (box) {
      query = query.eq('opportunity_box', box);
    }
    if (status) {
      query = query.eq('chairman_status', status);
    }

    query = query
      .order('confidence_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    const { data, error } = await query;

    if (error) throw error;

    res.json({ blueprints: data || [], count: (data || []).length });
  } catch (error) {
    console.error('Get blueprints error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/blueprints/:id
 * Get a single blueprint by ID
 */
router.get('/blueprints/:id', validateUuidParam('id'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await dbLoader.supabase
      .from('opportunity_blueprints')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Blueprint not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get blueprint error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
