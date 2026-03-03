/**
 * Refresh API - Handles database refresh and server restart requests
 *
 * SOVEREIGN PIPE v3.7.0: Replaced spawn/exec with ProcessManager
 */

// SOVEREIGN PIPE v3.7.0: Removed child_process - using ProcessManager
import path from 'path';
import { getProcessManager } from './CodebaseSearchService.js';

/**
 * Middleware: Require API key for admin endpoints.
 * Set ADMIN_API_KEY env var; requests must send Authorization: Bearer <key>.
 */
function requireAdminAuth(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    // If no key configured, reject all admin requests in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Admin API not configured' });
    }
    return next(); // Allow in development when unconfigured
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

class RefreshAPI {
  constructor(server, dbLoader) {
    this.server = server;
    this.dbLoader = dbLoader;
    this.serverStartTime = new Date();
  }

  setupRoutes(app) {
    // System status endpoint — sanitized (no PID, memory, or Node version)
    app.get('/api/system-status', (req, res) => {
      res.json({
        startTime: this.serverStartTime.toISOString(),
        uptime: Date.now() - this.serverStartTime.getTime(),
        status: 'running'
      });
    });

    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: this.dbLoader?.isConnected || false
      });
    });

    // Database refresh endpoint — requires admin auth
    app.post('/api/refresh', requireAdminAuth, async (req, res) => {
      try {
        const { type } = req.body;

        console.log(`🔄 Refresh request: ${type}`);

        if (type === 'database') {
          await this.refreshDatabase();
          res.json({
            success: true,
            type: 'database',
            message: 'Database refreshed successfully',
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(400).json({
            error: 'Invalid refresh type. Use "database"'
          });
        }
      } catch (error) {
        console.error('Refresh failed:', error.message);
        res.status(500).json({ error: 'Refresh failed' });
      }
    });

    // Server restart endpoint — requires admin auth
    app.post('/api/restart', requireAdminAuth, async (req, res) => {
      try {
        console.log('🔄 Server restart requested via API');

        res.json({
          success: true,
          message: 'Server restart initiated',
          timestamp: new Date().toISOString()
        });

        setTimeout(() => {
          this.restartServer();
        }, 1000);

      } catch (error) {
        console.error('Restart failed:', error.message);
        res.status(500).json({ error: 'Restart failed' });
      }
    });

    // Force refresh endpoint (database + restart) — requires admin auth
    app.post('/api/force-refresh', requireAdminAuth, async (req, res) => {
      try {
        console.log('🔄 Force refresh requested (database + restart)');

        await this.refreshDatabase();

        res.json({
          success: true,
          message: 'Database refreshed, server restart initiated',
          timestamp: new Date().toISOString()
        });

        setTimeout(() => {
          this.restartServer();
        }, 1000);

      } catch (error) {
        console.error('Force refresh failed:', error.message);
        res.status(500).json({ error: 'Force refresh failed' });
      }
    });
  }

  async refreshDatabase() {
    console.log('🔄 Refreshing database data...');
    
    // Use custom refresh handler if provided (from unified server)
    if (this.refreshHandler) {
      try {
        const result = await this.refreshHandler();
        console.log(`✅ Database refreshed: ${result.sds} SDs, ${result.prds} PRDs, ${result.ees} EES`);
        return result;
      } catch (error) {
        console.error('❌ Database refresh error:', error);
        throw error;
      }
    }
    
    // Fallback to default implementation
    if (!this.dbLoader?.isConnected) {
      throw new Error('Database not connected');
    }

    // Force reload all data
    try {
      const sds = await this.dbLoader.loadStrategicDirectives();
      const prds = await this.dbLoader.loadPRDs();
      const ees = await this.dbLoader.loadExecutionSequences();
      
      console.log(`✅ Database refreshed: ${sds.length} SDs, ${prds.length} PRDs, ${ees.length} EES`);
      
      // Broadcast update to all connected WebSocket clients
      if (global.wsClients) {
        const refreshData = {
          type: 'state',
          data: {
            strategicDirectives: sds,
            prds: prds,
            executionSequences: ees,
            lastUpdated: new Date().toISOString()
          }
        };
        
        global.wsClients.forEach(ws => {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(JSON.stringify(refreshData));
          }
        });
      }
      
      return { sds: sds.length, prds: prds.length, ees: ees.length };
    } catch (error) {
      console.error('❌ Database refresh error:', error);
      throw error;
    }
  }

  /**
   * Request server restart
   *
   * SOVEREIGN PIPE v3.7.0: No shell spawning from API layer.
   * Instead, we request restart through ProcessManager which
   * signals the orchestration layer to handle restart safely.
   */
  async restartServer() {
    console.log('🔄 Requesting server restart...');

    const processManager = getProcessManager();

    // Check if running under PM2
    const isPM2 = await processManager.isPM2Available();

    if (isPM2) {
      console.log('📦 Running under PM2 - restart will be handled by PM2');
    }

    // Request graceful restart through ProcessManager
    const result = await processManager.requestRestart();
    console.log(`✅ ${result.message}`);

    // Close current server connections gracefully
    if (this.server) {
      this.server.close(() => {
        console.log('✅ Server closed gracefully');
      });
    }

    // Signal restart request (let orchestration layer handle)
    setTimeout(() => {
      console.log('👋 Current process exiting for restart...');
      process.exit(0);
    }, 500);
  }

  /**
   * Alternative restart method using PM2 if available
   *
   * SOVEREIGN PIPE v3.7.0: Delegates to restartServer which uses ProcessManager
   */
  async restartWithPM2() {
    await this.restartServer();
  }
}

export default RefreshAPI;