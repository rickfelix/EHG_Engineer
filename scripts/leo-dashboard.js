#!/usr/bin/env node

/**
 * LEO Protocol Dashboard CLI
 * Command-line interface to manage the dashboard server
 */

import { spawn, execSync, exec  } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const DASHBOARD_DIR = path.join(__dirname, '..', 'lib', 'dashboard');
const PID_FILE = path.join(process.cwd(), '.leo-dashboard.pid');
const LOG_FILE = path.join(process.cwd(), '.leo-dashboard.log');
const CONFIG_FILE = path.join(process.cwd(), 'dashboard-config.json');

class DashboardCLI {
  constructor() {
    this.command = process.argv[2];
    this.args = process.argv.slice(3);
  }

  /**
   * Start the dashboard server
   */
  async start() {
    // Check if already running
    if (this.isRunning()) {
      console.log('⚠️ Dashboard is already running');
      console.log('Use "leo-dashboard restart" to restart');
      return;
    }
    
    console.log('🚀 Starting LEO Protocol Dashboard...');
    
    // Load configuration
    const config = this.loadConfig();
    
    // Start the server as a background process
    const serverPath = path.join(DASHBOARD_DIR, 'server.js');
    
    const env = { ...process.env };
    if (config.port) {
      env.DASHBOARD_PORT = config.port;
    }
    
    const server = spawn('node', [serverPath], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env
    });
    
    // Save PID
    fs.writeFileSync(PID_FILE, server.pid.toString());
    server.unref();
    
    console.log(`✅ Dashboard server started (PID: ${server.pid})`);
    
    // Wait for server to be ready
    await this.waitForServer(config.port || 3000);
    
    // Open in browser if configured
    if (config.autoOpen !== false) {
      this.open();
    } else {
      console.log(`📊 Dashboard: http://localhost:${config.port || 3000}`);
    }
  }

  /**
   * Stop the dashboard server
   */
  stop() {
    if (!this.isRunning()) {
      console.log('⚠️ Dashboard is not running');
      return;
    }
    
    try {
      const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
      
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
      
      fs.unlinkSync(PID_FILE);
      console.log('✅ Dashboard server stopped');
    } catch (error) {
      console.error('❌ Failed to stop dashboard:', error.message);
      
      // Try to clean up PID file anyway
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    }
  }

  /**
   * Restart the dashboard server
   */
  async restart() {
    console.log('🔄 Restarting dashboard...');
    this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start();
  }

  /**
   * Check dashboard status
   */
  status() {
    if (!this.isRunning()) {
      console.log('❌ Dashboard is not running');
      return;
    }
    
    try {
      const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
      const config = this.loadConfig();
      const port = config.port || 3000;
      
      console.log('✅ Dashboard is running');
      console.log(`   PID: ${pid}`);
      console.log(`   URL: http://localhost:${port}`);
      
      // Try to get metrics from the server
      this.getServerMetrics(port);
    } catch (error) {
      console.log('⚠️ Dashboard status unknown');
    }
  }

  /**
   * Open dashboard in browser
   */
  open() {
    const config = this.loadConfig();
    const port = config.port || 3000;
    const url = `http://localhost:${port}`;

    const platform = process.platform;
    let command;
    
    if (platform === 'darwin') {
      command = `open ${url}`;
    } else if (platform === 'win32') {
      command = `start ${url}`;
    } else {
      command = `xdg-open ${url}`;
    }
    
    exec(command, (error) => {
      if (error) {
        console.log(`💡 Open your browser and navigate to: ${url}`);
      } else {
        console.log(`🌐 Opening dashboard in browser: ${url}`);
      }
    });
  }

  /**
   * Show dashboard logs
   */
  logs() {
    if (!fs.existsSync(LOG_FILE)) {
      console.log('No logs available');
      return;
    }
    
    const logs = fs.readFileSync(LOG_FILE, 'utf8');
    console.log(logs);
  }

  /**
   * Edit dashboard configuration
   */
  config() {
    const editor = process.env.EDITOR || 'vi';
    
    // Create default config if it doesn't exist
    if (!fs.existsSync(CONFIG_FILE)) {
      this.createDefaultConfig();
    }
    
    execSync(`${editor} ${CONFIG_FILE}`, { stdio: 'inherit' });
    console.log('✅ Configuration saved');
  }

  /**
   * Install dashboard dependencies
   */
  async install() {
    console.log('📦 Installing dashboard dependencies...');
    
    // Install server dependencies
    console.log('\n📦 Installing server dependencies...');
    const serverDeps = [
      'express@^4.18.0',
      'ws@^8.14.0',
      'node-pty@^1.0.0',
      'cors@^2.8.5',
      'chokidar@^3.5.3'
    ];
    
    try {
      execSync(`npm install ${serverDeps.join(' ')}`, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ Server dependencies installed');
    } catch (error) {
      console.error('❌ Failed to install server dependencies');
      process.exit(1);
    }
    
    // Install client dependencies
    const clientDir = path.join(DASHBOARD_DIR, 'client');
    if (!fs.existsSync(path.join(clientDir, 'package.json'))) {
      console.log('\n📦 Setting up React client...');
      await this.setupReactClient();
    }
    
    console.log('\n✅ Dashboard installation complete!');
    console.log('Run "leo-dashboard start" to launch the dashboard');
  }

  /**
   * Setup React client
   */
  async setupReactClient() {
    const clientDir = path.join(DASHBOARD_DIR, 'client');
    
    // Create package.json for client
    const packageJson = {
      name: 'leo-dashboard-client',
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview'
      },
      dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
        'xterm': '^5.3.0',
        'xterm-addon-fit': '^0.8.0',
        'xterm-addon-web-links': '^0.9.0',
        '@tanstack/react-query': '^5.0.0',
        'socket.io-client': '^4.5.0'
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@vitejs/plugin-react': '^4.0.0',
        'vite': '^5.0.0',
        'typescript': '^5.0.0'
      }
    };
    
    fs.writeFileSync(
      path.join(clientDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    console.log('Installing React dependencies...');
    execSync('npm install', { 
      stdio: 'inherit',
      cwd: clientDir
    });
  }

  /**
   * Check if dashboard is running
   */
  isRunning() {
    if (!fs.existsSync(PID_FILE)) {
      return false;
    }
    
    try {
      const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
      
      // Check if process is running
      if (process.platform === 'win32') {
        const result = execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf8' });
        return result.includes(pid);
      } else {
        process.kill(pid, 0);
        return true;
      }
    } catch {
      // Process doesn't exist
      fs.unlinkSync(PID_FILE);
      return false;
    }
  }

  /**
   * Wait for server to be ready
   */
  async waitForServer(port, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${port}/api/status`, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject();
            }
          });
          req.on('error', reject);
          req.setTimeout(1000);
        });
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return false;
  }

  /**
   * Get server metrics
   */
  async getServerMetrics(port) {
    try {
      const response = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}/api/metrics`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      
      console.log('\n📊 Metrics:');
      console.log(`   Tests: ${response.tests?.passed || 0}/${response.tests?.total || 0} passed`);
      console.log(`   Coverage: ${response.coverage?.lines || 0}%`);
      console.log(`   Git: ${response.git?.branch || 'unknown'} (${response.git?.uncommittedChanges || 0} changes)`);
    } catch {
      // Metrics not available
    }
  }

  /**
   * Load configuration
   */
  loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      } catch (error) {
        console.warn('⚠️ Invalid configuration file, using defaults');
      }
    }
    return this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      port: 3000,
      autoOpen: true,
      terminal: {
        shell: process.env.SHELL || '/bin/bash',
        fontSize: 14,
        theme: 'dark'
      },
      dashboard: {
        refreshInterval: 5000,
        showMetrics: true,
        showActivityFeed: true
      }
    };
  }

  /**
   * Create default config file
   */
  createDefaultConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.getDefaultConfig(), null, 2));
  }

  /**
   * Show help
   */
  help() {
    console.log(`
LEO Protocol Dashboard CLI

Usage: leo-dashboard <command> [options]

Commands:
  start       Start the dashboard server
  stop        Stop the dashboard server
  restart     Restart the dashboard server
  status      Check dashboard status
  open        Open dashboard in browser
  logs        Show dashboard logs
  config      Edit dashboard configuration
  install     Install dashboard dependencies

Examples:
  leo-dashboard start       # Start dashboard
  leo-dashboard stop        # Stop dashboard
  leo-dashboard status      # Check if running
  leo-dashboard open        # Open in browser

Configuration:
  Edit dashboard-config.json or run "leo-dashboard config"

Default port: 3000
Dashboard URL: http://localhost:3000
`);
  }

  /**
   * Run the CLI
   */
  async run() {
    switch (this.command) {
      case 'start':
        await this.start();
        break;
      case 'stop':
        this.stop();
        break;
      case 'restart':
        await this.restart();
        break;
      case 'status':
        this.status();
        break;
      case 'open':
        this.open();
        break;
      case 'logs':
        this.logs();
        break;
      case 'config':
        this.config();
        break;
      case 'install':
        await this.install();
        break;
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        this.help();
        break;
      default:
        console.error(`Unknown command: ${this.command}`);
        this.help();
        process.exit(1);
    }
  }
}

// Run CLI
const cli = new DashboardCLI();
cli.run().catch(console.error);