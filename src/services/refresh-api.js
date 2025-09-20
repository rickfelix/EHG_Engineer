/**
 * Refresh API - Handles database refresh and server restart requests
 */

import {  spawn, exec  } from 'child_process';
import path from 'path';

class RefreshAPI {
  constructor(server, dbLoader) {
    this.server = server;
    this.dbLoader = dbLoader;
    this.serverStartTime = new Date();
  }

  setupRoutes(app) {
    // System status endpoint
    app.get('/api/system-status', (req, res) => {
      res.json({
        startTime: this.serverStartTime.toISOString(),
        uptime: Date.now() - this.serverStartTime.getTime(),
        pid: process.pid,
        memory: process.memoryUsage(),
        version: process.version,
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

    // Database refresh endpoint
    app.post('/api/refresh', async (req, res) => {
      try {
        const { type } = req.body;
        
        console.log(`🔄 Refresh request: ${type}`);
        
        if (type === 'database') {
          // Force reload data from database
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
        console.error('❌ Refresh failed:', error.message);
        res.status(500).json({ 
          error: error.message,
          type: 'refresh_error'
        });
      }
    });

    // Server restart endpoint
    app.post('/api/restart', async (req, res) => {
      try {
        console.log('🔄 Server restart requested via API');
        
        // Send response before restarting
        res.json({ 
          success: true, 
          message: 'Server restart initiated',
          timestamp: new Date().toISOString(),
          expectedDowntime: '10-15 seconds'
        });

        // Give response time to send
        setTimeout(() => {
          this.restartServer();
        }, 1000);

      } catch (error) {
        console.error('❌ Restart failed:', error.message);
        res.status(500).json({ 
          error: error.message,
          type: 'restart_error'
        });
      }
    });

    // Force refresh endpoint (database + restart)
    app.post('/api/force-refresh', async (req, res) => {
      try {
        console.log('🔄 Force refresh requested (database + restart)');
        
        // First refresh database
        await this.refreshDatabase();
        
        // Send response before restarting
        res.json({ 
          success: true, 
          message: 'Database refreshed, server restart initiated',
          timestamp: new Date().toISOString(),
          expectedDowntime: '10-15 seconds'
        });

        // Give response time to send, then restart
        setTimeout(() => {
          this.restartServer();
        }, 1000);

      } catch (error) {
        console.error('❌ Force refresh failed:', error.message);
        res.status(500).json({ 
          error: error.message,
          type: 'force_refresh_error'
        });
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

  restartServer() {
    console.log('🔄 Initiating server restart...');
    
    // Get current working directory and script path
    const cwd = process.cwd();
    const scriptPath = process.argv[1]; // Current script being run
    const args = process.argv.slice(2); // Arguments passed to current script
    
    console.log(`Restarting: ${process.execPath} ${scriptPath} ${args.join(' ')}`);
    console.log(`Working directory: ${cwd}`);
    
    // Close current server connections gracefully
    if (this.server) {
      this.server.close(() => {
        console.log('✅ Server closed gracefully');
      });
    }
    
    // Spawn new process with same arguments
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: cwd,
      detached: true,
      stdio: 'inherit'
    });
    
    child.unref(); // Allow parent to exit
    
    // Exit current process
    setTimeout(() => {
      console.log('👋 Current process exiting for restart...');
      process.exit(0);
    }, 500);
  }

  // Alternative restart method using pm2 if available
  restartWithPM2() {
    exec('pm2 restart leo-dashboard', (error, stdout, stderr) => {
      if (error) {
        console.log('PM2 not available, using direct restart');
        this.restartServer();
      } else {
        console.log('✅ Server restarted via PM2');
      }
    });
  }
}

export default RefreshAPI;