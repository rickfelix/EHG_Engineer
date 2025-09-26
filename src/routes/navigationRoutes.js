/**
 * Navigation API Routes
 * SD-002 Sprint 2: Story 2 - Quick Actions
 *
 * API endpoints for AI navigation and shortcut management
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const NavigationEngine = require('../services/ai-navigation/NavigationEngine');
const ShortcutManager = require('../services/ai-navigation/ShortcutManager');
const TelemetryService = require('../services/ai-navigation/TelemetryService');

// Initialize services
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const navigationEngine = new NavigationEngine(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const telemetryService = new TelemetryService(supabase);
const shortcutManager = new ShortcutManager(supabase, telemetryService);

// Initialize navigation engine
navigationEngine.initialize();

/**
 * GET /api/v1/navigation/predictions
 * Generate AI-powered navigation predictions
 */
router.post('/predictions', async (req, res) => {
  try {
    const { userId, currentPath, context } = req.body;

    if (!userId || !currentPath) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, currentPath'
      });
    }

    const result = await navigationEngine.predict(userId, currentPath, context);

    res.json({
      success: true,
      predictions: result.predictions,
      confidence: result.confidence,
      fromCache: result.fromCache,
      responseTime: result.responseTime
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      error: 'Failed to generate predictions',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/navigation/record
 * Record navigation event for telemetry and learning
 */
router.post('/record', async (req, res) => {
  try {
    const { userId, sessionId, from, to, source, predictionUsed, timestamp } = req.body;

    if (!userId || !from || !to) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, from, to'
      });
    }

    // Record navigation pattern
    await navigationEngine.recordNavigation(userId, sessionId, from, to, {
      source,
      predictionUsed,
      timestamp
    });

    // Record telemetry
    await telemetryService.trackNavigation(from, to, {
      userId,
      sessionId,
      source,
      predictionUsed
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Recording error:', error);
    res.status(500).json({
      error: 'Failed to record navigation',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/navigation/shortcuts
 * Get user shortcuts (enhanced with customization support)
 */
router.post('/shortcuts', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required parameter: userId'
      });
    }

    const shortcuts = await shortcutManager.getUserShortcuts(userId);

    res.json({
      success: true,
      shortcuts
    });
  } catch (error) {
    console.error('Shortcuts error:', error);
    res.status(500).json({
      error: 'Failed to get shortcuts',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/navigation/available-paths
 * Get available paths for shortcut customization
 */
router.get('/available-paths', async (req, res) => {
  try {
    const paths = await shortcutManager.getAvailablePaths();

    res.json({
      success: true,
      paths
    });
  } catch (error) {
    console.error('Available paths error:', error);
    res.status(500).json({
      error: 'Failed to get available paths',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/navigation/shortcuts/save
 * Save custom shortcut
 */
router.post('/shortcuts/save', async (req, res) => {
  try {
    const { userId, shortcutKey, targetPath, label, icon } = req.body;

    if (!userId || !shortcutKey || !targetPath || !label) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, shortcutKey, targetPath, label'
      });
    }

    const result = await shortcutManager.saveUserShortcut(
      userId,
      shortcutKey,
      targetPath,
      label,
      icon
    );

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Save shortcut error:', error);
    res.status(500).json({
      error: 'Failed to save shortcut',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/navigation/shortcuts/reset
 * Reset shortcuts to defaults
 */
router.post('/shortcuts/reset', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required parameter: userId'
      });
    }

    const result = await shortcutManager.resetUserShortcuts(userId);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Reset shortcuts error:', error);
    res.status(500).json({
      error: 'Failed to reset shortcuts',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/navigation/shortcuts/:key
 * Delete custom shortcut
 */
router.delete('/shortcuts/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { userId } = req.body;

    if (!userId || !key) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, key'
      });
    }

    const result = await shortcutManager.deleteUserShortcut(userId, key);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Delete shortcut error:', error);
    res.status(500).json({
      error: 'Failed to delete shortcut',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/navigation/shortcuts/export
 * Export user shortcuts for backup
 */
router.get('/shortcuts/export', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required parameter: userId'
      });
    }

    const result = await shortcutManager.exportUserShortcuts(userId);

    if (result.success) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.json(result.data);
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Export shortcuts error:', error);
    res.status(500).json({
      error: 'Failed to export shortcuts',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/navigation/shortcuts/import
 * Import user shortcuts from backup
 */
router.post('/shortcuts/import', async (req, res) => {
  try {
    const { userId, importData } = req.body;

    if (!userId || !importData) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, importData'
      });
    }

    const result = await shortcutManager.importUserShortcuts(userId, importData);

    res.json(result);
  } catch (error) {
    console.error('Import shortcuts error:', error);
    res.status(500).json({
      error: 'Failed to import shortcuts',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/navigation/telemetry/session
 * Get session analytics
 */
router.get('/telemetry/session', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing required parameter: sessionId'
      });
    }

    const analytics = await telemetryService.getSessionAnalytics();

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Session analytics error:', error);
    res.status(500).json({
      error: 'Failed to get session analytics',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/navigation/telemetry/metrics
 * Get aggregated navigation metrics
 */
router.get('/telemetry/metrics', async (req, res) => {
  try {
    const { userId, days = 7 } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required parameter: userId'
      });
    }

    const metrics = await telemetryService.getAggregatedMetrics(userId, parseInt(days));

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Aggregated metrics error:', error);
    res.status(500).json({
      error: 'Failed to get aggregated metrics',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/navigation/telemetry/export
 * Export telemetry data
 */
router.post('/telemetry/export', async (req, res) => {
  try {
    const { format = 'json', filters = {} } = req.body;

    const data = await telemetryService.exportData(format, filters);

    if (data) {
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="navigation_telemetry.csv"');
        res.send(data);
      } else {
        res.json({
          success: true,
          data
        });
      }
    } else {
      res.status(500).json({
        error: 'Failed to export telemetry data'
      });
    }
  } catch (error) {
    console.error('Export telemetry error:', error);
    res.status(500).json({
      error: 'Failed to export telemetry data',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/navigation/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      navigationEngine: navigationEngine.isInitialized,
      telemetryService: true,
      shortcutManager: true
    }
  });
});

module.exports = router;