/**
 * Server State Management
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import path from 'path';
import fs from 'fs';
import { PROJECT_ROOT, dbLoader, versionDetector, realtimeDashboard } from './config.js';

// State management
export let dashboardState = {
  leoProtocol: {
    version: 'Loading...', // Will be set async in loadState()
    activeRole: null,
    currentSD: null,
    currentPRD: null,
    phase: null
  },
  context: {
    usage: 0,
    total: 180000,
    breakdown: {}
  },
  handoffs: [],
  strategicDirectives: [],
  prds: [],
  checklists: {},
  progress: {
    overall: 0,
    byPhase: {}
  },
  // New: Application state
  application: {
    name: 'EHG_Engineer',
    version: '1.0.0',
    features: {
      dashboard: true,
      voiceAssistant: false, // Will be enabled when implementing OpenAI Realtime
      portfolio: false
    }
  }
};

/**
 * Load initial state from files and database
 */
export async function loadState(broadcastUpdate) {
  try {
    console.log('🚀 EHG_Engineer Unified Server Starting...');

    // Load LEO status
    const statusPath = path.join(PROJECT_ROOT, '.leo-status.json');
    if (fs.existsSync(statusPath)) {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      dashboardState.leoProtocol = {
        ...dashboardState.leoProtocol,
        ...status,
        version: await versionDetector.getVersion()
      };
    }

    // Load context state
    const contextPath = path.join(PROJECT_ROOT, '.leo-context-state.json');
    if (fs.existsSync(contextPath)) {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      if (context.currentUsage) {
        const breakdown = context.currentUsage;
        const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
        dashboardState.context = {
          usage: total,
          total: 180000,
          breakdown: breakdown
        };
      }
    }

    // Load from database if connected
    if (dbLoader.isConnected) {
      console.log('📊 Loading data from database...');

      // Load PRDs first for SD progress calculation
      dashboardState.prds = await dbLoader.loadPRDs();

      // Load Strategic Directives
      dashboardState.strategicDirectives = await dbLoader.loadStrategicDirectives();

      // Load Execution Sequences
      dashboardState.executionSequences = await dbLoader.loadExecutionSequences();

      console.log(`✅ Loaded ${dashboardState.strategicDirectives.length} SDs from database`);

      // Check for SD-2025-001
      const sd2025 = dashboardState.strategicDirectives.find(sd => sd.id === 'SD-2025-001');
      if (sd2025) {
        console.log('✅ SD-2025-001 (OpenAI Realtime Voice) loaded successfully');
      }

      // Start real-time subscriptions for automatic updates
      if (broadcastUpdate) {
        realtimeDashboard.startSubscriptions((type, data) => {
          // Update state when database changes are detected
          dashboardState[type] = data;
          broadcastUpdate('realtime-update', { type, data });
          console.log(`📡 Real-time update: ${type} (${data.length} items)`);
        });
      }

    } else {
      console.log('⚠️  Database not connected - limited functionality');
    }

    console.log(`📋 LEO Protocol version: ${dashboardState.leoProtocol.version}`);
    console.log(`🌐 Application: ${dashboardState.application.name} v${dashboardState.application.version}`);

  } catch (error) {
    console.error('Error loading state:', error);
  }
}

/**
 * Update dashboard state
 */
export function updateDashboardState(key, value) {
  dashboardState[key] = value;
}

/**
 * Get current dashboard state
 */
export function getDashboardState() {
  return dashboardState;
}
