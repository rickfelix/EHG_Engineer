#!/usr/bin/env node

/**
 * EHG_Engineer Unified Application Server
 * Combines LEO Protocol Dashboard with main application
 * Single server for all features - no more separate processes
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import chokidar from 'chokidar';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Import services from new location
import DatabaseLoader from './src/services/database-loader.js';
import RealtimeManager from './src/services/realtime-manager.js';
import RefreshAPI from './src/services/refresh-api.js';
import LEOVersionDetector from './src/services/version-detector.js';
import RealtimeDashboard from './src/services/realtime-dashboard.js';

// Import Story API
import * as storiesAPI from './src/api/stories.js';
import StoryAgentBootstrap from './src/agents/story-bootstrap.js';

// Import Smart Search Engine (Sprint 4)
import { getSearchEngine } from './src/services/ai-navigation/SmartSearchEngine.js';

// Import Opportunity Management Routes (SD-1A)
import opportunitiesRouter from './src/routes/opportunities.js';

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

// Global WebSocket clients tracking for refresh API
global.wsClients = new Set();

// Initialize components
const dbLoader = new DatabaseLoader();
const realtimeManager = new RealtimeManager();
const refreshAPI = new RefreshAPI(server, dbLoader);
const versionDetector = new LEOVersionDetector();
const realtimeDashboard = new RealtimeDashboard(dbLoader);

// Initialize OpenAI if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI integration enabled');
} else {
  console.log('⚠️ OpenAI API key not found - AI features will use fallback mode');
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the client build
app.use(express.static(path.join(__dirname, 'src/client/dist')));

// State management
let dashboardState = {
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

// Load initial state
async function loadState() {
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

      // Load current working SD from database
      try {
        const { data: workingSD } = await dbLoader.supabase
          .rpc('get_working_sd');

        if (workingSD && workingSD.length > 0) {
          dashboardState.leoProtocol.currentSD = workingSD[0].id;
          console.log(`⚡ Current working SD: ${workingSD[0].id} - ${workingSD[0].title}`);
          console.log(`   Started at: ${new Date(workingSD[0].started_at).toLocaleString()}`);
        } else {
          console.log('💤 No SD currently being worked on');
        }
      } catch (error) {
        console.log('⚠️ Could not load working SD:', error.message);
      }

      // Check for SD-2025-001
      const sd2025 = dashboardState.strategicDirectives.find(sd => sd.id === 'SD-2025-001');
      if (sd2025) {
        console.log('✅ SD-2025-001 (OpenAI Realtime Voice) loaded successfully');
      }
      
      // Start real-time subscriptions for automatic updates
      realtimeDashboard.startSubscriptions((type, data) => {
        // Update state when database changes are detected
        dashboardState[type] = data;
        broadcastUpdate('realtime-update', { type, data });
        console.log(`📡 Real-time update: ${type} (${data.length} items)`);
      });
      
    } else {
      console.log('⚠️  Database not connected - limited functionality');
    }

    console.log(`📋 LEO Protocol version: ${dashboardState.leoProtocol.version}`);
    console.log(`🌐 Application: ${dashboardState.application.name} v${dashboardState.application.version}`);

  } catch (error) {
    console.error('Error loading state:', error);
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  global.wsClients.add(ws);
  console.log('✨ New WebSocket client connected');
  
  // Send initial state
  ws.send(JSON.stringify({
    type: 'state',
    data: dashboardState
  }));
  
  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      
      if (msg.type === 'setActiveSD') {
        const { sdId } = msg.data;
        console.log(`⚡ Setting working SD to: ${sdId}`);

        // Update in database using our new function
        const { data, error } = await dbLoader.supabase
          .rpc('set_working_sd', { p_sd_id: sdId });

        if (error) {
          console.error('❌ Error setting working SD:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Failed to set working SD: ${error.message}`
          }));
        } else {
          console.log(`✅ Successfully set working SD to ${sdId}`);
          console.log('Result:', data);

          // Update dashboard state
          dashboardState.leoProtocol.currentSD = sdId;

          // Broadcast to all clients
          broadcastUpdate('workingSD', { sdId, timestamp: new Date() });
        }
      } else if (msg.type === 'updateSDStatus') {
        const { sdId, status } = msg.data;
        console.log(`📝 Updating SD ${sdId} status to: ${status}`);
        
        // Update in database
        const { error } = await dbLoader.supabase
          .from('strategic_directives_v2')
          .update({ status })
          .eq('id', sdId);
        
        if (error) {
          console.error('❌ Error updating SD status:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Failed to update status: ${error.message}`
          }));
        } else {
          console.log(`✅ Successfully updated ${sdId} to ${status}`);
          
          // Reload strategic directives to broadcast update to all clients
          dashboardState.strategicDirectives = await dbLoader.loadStrategicDirectives();
          
          // Broadcast the updated state to all clients
          broadcastUpdate('state', dashboardState);
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    global.wsClients.delete(ws);
    console.log('👋 WebSocket client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast state updates to all connected clients
function broadcastUpdate(type, data) {
  const message = JSON.stringify({ type, data });
  global.wsClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// =============================================================================
// API ROUTES
// =============================================================================

// AI Navigation API endpoints (SD-002 Sprint 2)
// Predict navigation destinations
app.post('/api/v1/navigation/predictions', async (req, res) => {
  try {
    const { userId, currentPath, context } = req.body;

    // Simplified prediction logic for Sprint 2
    const predictions = [
      { path: '/dashboard', confidence: 0.8, reason: 'frequently_visited' },
      { path: '/strategic-directives', confidence: 0.6, reason: 'workflow_pattern' },
      { path: '/backlog', confidence: 0.4, reason: 'related_content' }
    ];

    res.json({
      success: true,
      predictions,
      confidence: 0.6,
      fromCache: false,
      responseTime: 50
    });
  } catch (error) {
    console.error('Navigation prediction error:', error);
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

// Get user shortcuts
app.post('/api/v1/navigation/shortcuts', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!dbLoader.isConnected) {
      // Fallback to default shortcuts (Sprint 3: Full 1-9 range)
      const shortcuts = [
        { shortcut_key: '1', label: 'Dashboard', target_path: '/dashboard', icon: 'home', is_enabled: true, display_order: 1, is_custom: false },
        { shortcut_key: '2', label: 'Strategic Directives', target_path: '/strategic-directives', icon: 'target', is_enabled: true, display_order: 2, is_custom: false },
        { shortcut_key: '3', label: 'PRDs', target_path: '/prds', icon: 'file-text', is_enabled: true, display_order: 3, is_custom: false },
        { shortcut_key: '4', label: 'Backlog', target_path: '/backlog', icon: 'list', is_enabled: true, display_order: 4, is_custom: false },
        { shortcut_key: '5', label: 'Stories', target_path: '/stories', icon: 'book', is_enabled: true, display_order: 5, is_custom: false },
        { shortcut_key: '6', label: 'Reports', target_path: '/reports', icon: 'bar-chart', is_enabled: true, display_order: 6, is_custom: false },
        { shortcut_key: '7', label: 'Analytics', target_path: '/analytics', icon: 'trending-up', is_enabled: true, display_order: 7, is_custom: false },
        { shortcut_key: '8', label: 'Settings', target_path: '/settings', icon: 'settings', is_enabled: true, display_order: 8, is_custom: false },
        { shortcut_key: '9', label: 'Profile', target_path: '/profile', icon: 'user', is_enabled: true, display_order: 9, is_custom: false }
      ];
      return res.json({ success: true, shortcuts, persistence: 'localStorage_fallback' });
    }

    // Get user shortcuts from database using the function
    if (userId) {
      const { data: shortcuts, error } = await dbLoader.supabase.rpc('get_user_shortcuts', { p_user_id: userId });

      if (error) {
        console.error('Database error getting shortcuts:', error);
        throw error;
      }

      if (shortcuts && shortcuts.length > 0) {
        return res.json({ success: true, shortcuts });
      }
    }

    // Fallback to default shortcuts from navigation_shortcuts table
    const { data: defaultShortcuts, error: defaultError } = await dbLoader.supabase
      .from('navigation_shortcuts')
      .select('key as shortcut_key, label, target_path, icon, is_enabled, display_order, is_custom')
      .is('user_id', null)
      .eq('is_enabled', true)
      .order('display_order');

    if (defaultError) {
      console.error('Database error getting default shortcuts:', defaultError);
      throw defaultError;
    }

    res.json({ success: true, shortcuts: defaultShortcuts || [] });
  } catch (error) {
    console.error('Shortcuts error:', error);
    res.status(500).json({ error: 'Failed to get shortcuts' });
  }
});

// Get available paths for customization
app.get('/api/v1/navigation/available-paths', (req, res) => {
  const paths = [
    { path: '/dashboard', label: 'Dashboard', icon: 'home' },
    { path: '/strategic-directives', label: 'Strategic Directives', icon: 'target' },
    { path: '/prds', label: 'Product Requirements', icon: 'file-text' },
    { path: '/backlog', label: 'Backlog', icon: 'list' },
    { path: '/stories', label: 'User Stories', icon: 'book' },
    { path: '/reports', label: 'Reports', icon: 'bar-chart' },
    { path: '/analytics', label: 'Analytics', icon: 'trending-up' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
    { path: '/profile', label: 'Profile', icon: 'user' }
  ];

  res.json({ success: true, paths });
});

// Save custom shortcut
app.post('/api/v1/navigation/shortcuts/save', async (req, res) => {
  try {
    const { userId, shortcutKey, targetPath, label, icon, displayOrder } = req.body;
    console.log('Saving custom shortcut:', { userId, shortcutKey, targetPath, label, icon });

    if (!dbLoader.isConnected) {
      return res.json({ success: true, message: 'Database not connected - changes not persisted' });
    }

    if (!userId || !shortcutKey || !targetPath || !label) {
      return res.status(400).json({ success: false, error: 'Missing required fields: userId, shortcutKey, targetPath, label' });
    }

    // Save user shortcut using database function
    const { data: result, error } = await dbLoader.supabase.rpc('save_user_shortcut', {
      p_user_id: userId,
      p_shortcut_key: shortcutKey,
      p_target_path: targetPath,
      p_label: label,
      p_icon: icon || null,
      p_display_order: displayOrder || 0
    });

    if (error) {
      console.error('Database error saving shortcut:', error);
      return res.status(500).json({ success: false, error: 'Failed to save shortcut' });
    }

    res.json({ success: true, message: 'Shortcut saved successfully' });
  } catch (error) {
    console.error('Save shortcut error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset shortcuts
app.post('/api/v1/navigation/shortcuts/reset', async (req, res) => {
  try {
    const { userId } = req.body;
    console.log('Resetting shortcuts for user:', userId);

    if (!dbLoader.isConnected) {
      return res.json({ success: true, message: 'Database not connected - using defaults' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }

    // Reset user shortcuts using database function
    const { data: result, error } = await dbLoader.supabase.rpc('reset_user_shortcuts', {
      p_user_id: userId
    });

    if (error) {
      console.error('Database error resetting shortcuts:', error);
      return res.status(500).json({ success: false, error: 'Failed to reset shortcuts' });
    }

    res.json({ success: true, message: 'Shortcuts reset to defaults' });
  } catch (error) {
    console.error('Reset shortcuts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record navigation event
app.post('/api/v1/navigation/record', (req, res) => {
  try {
    const { userId, sessionId, from, to, source, predictionUsed } = req.body;
    console.log('Recording navigation:', { userId, from, to, source, predictionUsed });

    // Log for telemetry (will integrate with database in future)
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record navigation' });
  }
});

// ==========================================
// Sprint 4: Smart Search API Endpoints
// ==========================================

// Initialize search engine
const searchEngine = getSearchEngine();

// Main search endpoint
app.post('/api/v1/search', async (req, res) => {
  try {
    const { query, context = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Add session context
    context.sessionId = req.sessionID || 'default';
    context.currentPath = req.headers.referer || '/';

    // Perform search
    const startTime = Date.now();
    const searchResults = searchEngine
      ? await searchEngine.search(query, context)
      : { results: [], searchTime: 0, error: 'Search engine not initialized' };

    // Ensure response time is under 500ms
    const totalTime = Date.now() - startTime;
    if (totalTime > 500) {
      console.warn(`Search exceeded 500ms target: ${totalTime}ms for query "${query}"`);
    }

    res.json({
      query,
      results: searchResults.results || [],
      searchTime: searchResults.searchTime || totalTime,
      fromCache: searchResults.fromCache || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

// Search suggestions endpoint
app.get('/api/v1/search/suggestions', async (req, res) => {
  try {
    const { prefix } = req.query;

    if (!prefix || prefix.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = searchEngine
      ? await searchEngine.getSuggestions(prefix)
      : ['Dashboard', 'Settings', 'Portfolio', 'Search'];

    res.json({
      prefix,
      suggestions: suggestions || []
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.json({ suggestions: [] });
  }
});

// Search feedback endpoint (for learning)
app.post('/api/v1/search/feedback', async (req, res) => {
  try {
    const { query, selectedResult, shownResults = [] } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (searchEngine) {
      await searchEngine.recordFeedback(query, selectedResult, shownResults);
    }

    res.json({
      success: true,
      message: 'Feedback recorded'
    });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({
      error: 'Failed to record feedback',
      message: error.message
    });
  }
});

// Search index status endpoint
app.get('/api/v1/search/status', async (req, res) => {
  try {
    const status = {
      engineInitialized: !!searchEngine,
      cacheEnabled: true,
      databaseConnected: !!dbLoader.supabase,
      searchAvailable: true
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get search status',
      message: error.message
    });
  }
});

// Clear search cache endpoint (admin)
app.post('/api/v1/search/cache/clear', async (req, res) => {
  try {
    if (searchEngine) {
      searchEngine.clearCache();
    }

    res.json({
      success: true,
      message: 'Search cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

// SDIP/DirectiveLab API endpoints
app.post('/api/sdip/submit', async (req, res) => {
  console.log('\n🚀 ========== NEW SUBMISSION (STEP 1) ==========');
  console.log('📥 [SERVER] Received POST /api/sdip/submit');
  console.log('📦 [SERVER] Request body keys:', Object.keys(req.body));
  
  try {
    const submission = req.body;
    console.log('👤 [SERVER] Chairman Input:', submission.chairman_input ? submission.chairman_input.substring(0, 100) + '...' : 'None');
    console.log('📝 [SERVER] Submission Title:', submission.submission_title || 'Untitled');
    console.log('🔢 [SERVER] Current Step:', submission.current_step || 1);
    
    // Store initial submission in database (Step 1 data only)
    console.log('💾 [SERVER] Saving to database...');
    const result = await dbLoader.saveSDIPSubmission(submission);
    
    // Broadcast update to WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'sdip_submission',
          data: result
        }));
      }
    });
    
    console.log('✅ [SERVER] Submission saved with ID:', result.id);
    console.log('🆔 [SERVER] Submission ID type:', typeof result.id);
    console.log('✅ [SERVER] Step 1 complete, returning submission');
    res.json({ success: true, submission: result });
  } catch (error) {
    console.error('❌ [SERVER] SDIP submission error:', error.message);
    console.error('❌ [SERVER] Stack trace:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Update submission with data from a specific step
app.put('/api/sdip/submissions/:id/step/:stepNumber', async (req, res) => {
  const { id } = req.params;
  const stepNumber = parseInt(req.params.stepNumber);
  
  console.log(`\n🔄 ========== UPDATE STEP ${stepNumber} ==========`);
  console.log(`📥 [SERVER] Received PUT /api/sdip/submissions/${id}/step/${stepNumber}`);
  console.log('🆔 [SERVER] Submission ID:', id);
  console.log('🆔 [SERVER] ID type:', typeof id);
  console.log('🔢 [SERVER] Step Number:', stepNumber);
  console.log('📦 [SERVER] Request body keys:', Object.keys(req.body));
  
  try {
    const stepData = req.body;
    console.log(`📋 [SERVER] Step ${stepNumber} data preview:`, JSON.stringify(stepData).substring(0, 200));
    
    // Special handling for Step 2: Generate intent summary with OpenAI
    if (stepNumber === 2 && openai) {
      // If we have the original feedback, generate intent
      if (stepData.feedback || stepData.chairman_input) {
        try {
          console.log('🤖 Generating intent summary with OpenAI for step 2...');
          const feedback = stepData.feedback || stepData.chairman_input;
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "You are an expert at extracting clear, actionable intent from user feedback. Extract the main intent or goal from the following feedback in 1-2 clear sentences. Focus on what the user wants to achieve or improve."
              },
              {
                role: "user",
                content: feedback
              }
            ],
            temperature: 0.3,
            max_tokens: 150
          });
          
          stepData.intent_summary = completion.choices[0].message.content;
          console.log('✅ [SERVER] Intent summary generated:', stepData.intent_summary.substring(0, 100) + '...');
        } catch (aiError) {
          console.error('⚠️ OpenAI intent generation failed:', aiError.message);
          // Continue without AI-generated intent
        }
      }
    }
    
    // Update the submission with step data
    console.log('💾 [SERVER] Calling database loader to update submission...');
    const updatedSubmission = await dbLoader.updateSubmissionStep(id, stepNumber, stepData);
    console.log('✅ [SERVER] Database update successful');
    console.log('🆔 [SERVER] Updated submission ID:', updatedSubmission?.id);
    
    // Broadcast update to WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'sdip_step_update',
          submissionId: id,
          stepNumber,
          data: updatedSubmission
        }));
      }
    });
    
    console.log(`✅ [SERVER] Step ${stepNumber} update complete`);
    res.json({ 
      success: true, 
      submission: updatedSubmission,
      message: `Step ${stepNumber} data updated successfully`
    });
  } catch (error) {
    console.error(`❌ [SERVER] Error updating submission step ${stepNumber}:`, error.message);
    console.error('❌ [SERVER] Stack trace:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sdip/submissions', async (req, res) => {
  try {
    console.log('📋 API: Starting getRecentSDIPSubmissions request');
    console.log('📋 API: Database connected:', dbLoader.isConnected);
    
    const submissions = await dbLoader.getRecentSDIPSubmissions();
    console.log('📋 API: Successfully retrieved', submissions.length, 'submissions');
    res.json(submissions);
  } catch (error) {
    console.error('❌ API Error in /api/sdip/submissions:', error.message);
    console.error('❌ Full error details:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to list submissions', details: error.message });
  }
});

// Delete a submission
app.delete('/api/sdip/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ API: Deleting submission:', id);
    
    // First check if using in-memory storage
    if (global.sdipSubmissions) {
      const index = global.sdipSubmissions.findIndex(s => s.id === id);
      if (index !== -1) {
        global.sdipSubmissions.splice(index, 1);
        console.log('✅ API: Submission deleted from in-memory storage');
        res.json({ success: true, id });
        return;
      }
    }
    
    // Try database deletion if connected
    if (dbLoader.isConnected && dbLoader.supabase) {
      // Try directive_submissions table first (what getRecentSDIPSubmissions uses)
      const { error: directiveError } = await dbLoader.supabase
        .from('directive_submissions')
        .delete()
        .eq('id', id);
      
      if (!directiveError) {
        console.log('✅ API: Submission deleted from directive_submissions table');
        res.json({ success: true, id });
        return;
      }
      
      // If that fails, try sdip_submissions table (for bigint IDs)
      const { error: sdipError } = await dbLoader.supabase
        .from('sdip_submissions')
        .delete()
        .eq('id', id);
      
      if (!sdipError) {
        console.log('✅ API: Submission deleted from sdip_submissions table');
        res.json({ success: true, id });
        return;
      }
      
      console.error('❌ Database errors:', { directiveError, sdipError });
      throw new Error('Failed to delete from both tables');
    }
    
    throw new Error('No storage method available');
  } catch (error) {
    console.error('❌ API Error in DELETE /api/sdip/submissions:', error.message);
    res.status(500).json({ error: 'Failed to delete submission', details: error.message });
  }
});

app.post('/api/sdip/screenshot', async (req, res) => {
  try {
    const { submissionId, screenshot } = req.body;
    const result = await dbLoader.saveScreenshot(submissionId, screenshot);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Screenshot upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sdip/progress/:id', async (req, res) => {
  try {
    const progress = await dbLoader.getSubmissionProgress(req.params.id);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// EHG BACKLOG API ENDPOINTS
// =============================================================================

// Get strategic directives from backlog
app.get('/api/backlog/strategic-directives', async (req, res) => {
  try {
    const { tier, page, minMustHave, sort = 'sequence' } = req.query;
    
    let query = dbLoader.supabase
      .from('strategic_directives_backlog')
      .select('*');
    
    if (tier) {
      query = query.eq('rolled_triage', tier);
    }
    if (page) {
      query = query.eq('page_title', page);
    }
    if (minMustHave) {
      query = query.gte('must_have_pct', parseFloat(minMustHave));
    }
    
    if (sort === 'priority') {
      query = query.order('must_have_pct', { ascending: false })
                   .order('sequence_rank', { ascending: true });
    } else {
      query = query.order('sequence_rank', { ascending: true });
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get SD detail with backlog items
app.get('/api/backlog/strategic-directives/:sd_id', async (req, res) => {
  try {
    const { sd_id } = req.params;
    
    // Get SD
    const { data: sd, error: sdError } = await dbLoader.supabase
      .from('strategic_directives_backlog')
      .select('*')
      .eq('sd_id', sd_id)
      .single();
    
    if (sdError) throw sdError;
    
    // Get backlog items
    const { data: items, error: itemsError } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sd_id)
      .order('stage_number', { ascending: true });
    
    if (itemsError) throw itemsError;
    
    res.json({ ...sd, backlog_items: items });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all strategic directives with backlog items (optimized)
app.get('/api/backlog/strategic-directives-with-items', async (req, res) => {
  try {
    const { tier, page, minMustHave, sort = 'sequence' } = req.query;
    
    // First get all strategic directives
    let sdQuery = dbLoader.supabase
      .from('strategic_directives_backlog')
      .select('*');
    
    if (tier) {
      sdQuery = sdQuery.eq('rolled_triage', tier);
    }
    if (page) {
      sdQuery = sdQuery.eq('page_title', page);
    }
    if (minMustHave) {
      sdQuery = sdQuery.gte('must_have_pct', parseFloat(minMustHave));
    }
    
    if (sort === 'priority') {
      sdQuery = sdQuery.order('must_have_pct', { ascending: false })
                       .order('sequence_rank', { ascending: true });
    } else {
      sdQuery = sdQuery.order('sequence_rank', { ascending: true });
    }
    
    const { data: sds, error: sdError } = await sdQuery;
    if (sdError) throw sdError;
    
    if (sds.length === 0) {
      return res.json([]);
    }
    
    // Get all backlog items for these SDs in a single query
    const sdIds = sds.map(sd => sd.sd_id);
    const { data: allItems, error: itemsError } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .in('sd_id', sdIds)
      .order('stage_number', { ascending: true });
    
    if (itemsError) throw itemsError;
    
    // Group items by SD ID
    const itemsMap = {};
    allItems.forEach(item => {
      if (!itemsMap[item.sd_id]) {
        itemsMap[item.sd_id] = [];
      }
      itemsMap[item.sd_id].push(item);
    });
    
    // Combine SDs with their backlog items
    const result = sds.map(sd => ({
      ...sd,
      backlog_items: itemsMap[sd.sd_id] || []
    }));
    
    res.json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple in-memory cache for backlog summaries (1 hour TTL)
const summaryCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Get AI-generated backlog summary for a strategic directive
app.get('/api/strategic-directives/:id/backlog-summary', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `backlog_summary_${id}`;

    // Check cache first
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    // Get backlog items for this SD
    const { data: items, error: itemsError } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', id)
      .order('stage_number', { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    if (!items || items.length === 0) {
      return res.json({
        summary: null,
        item_count: 0,
        message: "No backlog items found"
      });
    }

    // Combine all text fields from backlog items
    const allText = items.map(item => {
      const parts = [];
      if (item.backlog_title) parts.push(`Title: ${item.backlog_title}`);
      if (item.item_description) parts.push(`Description: ${item.item_description}`);
      if (item.my_comments) parts.push(`Comments: ${item.my_comments}`);
      if (item.phase) parts.push(`Phase: ${item.phase}`);
      if (item.priority) parts.push(`Priority: ${item.priority}`);
      return parts.join(' | ');
    }).join('\n\n');

    let summary = null;
    let ai_generated = false;

    // Try to generate AI summary if OpenAI is available
    if (openai && allText.trim()) {
      try {
        console.log(`🤖 Generating backlog summary for SD ${id}...`);

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a technical project manager. Summarize backlog items in 2-3 clear sentences, focusing on main features, priorities, and scope. Be concise and actionable."
            },
            {
              role: "user",
              content: `Please summarize these backlog items for a strategic directive:\n\n${allText}`
            }
          ],
          max_tokens: 200,
          temperature: 0.3
        });

        summary = completion.choices[0]?.message?.content?.trim();
        ai_generated = true;

        console.log(`✅ AI summary generated for SD ${id}`);

      } catch (aiError) {
        console.error('⚠️ OpenAI summarization failed:', aiError.message);

        // Fallback to simple text summary
        const titles = items.map(item => item.backlog_title).filter(Boolean);
        const priorities = [...new Set(items.map(item => item.priority).filter(Boolean))];

        summary = `${items.length} backlog items including: ${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '...' : ''}. Priority levels: ${priorities.join(', ')}.`;
        ai_generated = false;
      }
    } else {
      // Fallback summary when OpenAI not available
      const titles = items.map(item => item.backlog_title).filter(Boolean);
      const priorities = [...new Set(items.map(item => item.priority).filter(Boolean))];

      summary = `${items.length} backlog items including: ${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '...' : ''}. Priority levels: ${priorities.join(', ')}.`;
      ai_generated = false;
    }

    const result = {
      summary,
      ai_generated,
      item_count: items.length,
      generated_at: new Date().toISOString()
    };

    // Cache the result
    summaryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    res.json(result);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder strategic directives by updating execution_order
app.patch('/api/strategic-directives/:id/reorder', async (req, res) => {
  try {
    const { id } = req.params;
    const { direction } = req.body;

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'Direction must be "up" or "down"' });
    }

    // Get all strategic directives sorted by current order
    const { data: allSDs, error: fetchError } = await dbLoader.supabase
      .from('strategic_directives_v2')
      .select('id, execution_order, title, priority')
      .order('execution_order', { ascending: true, nullsFirst: true })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw fetchError;
    }

    // First, ensure all SDs have execution_order values
    // If any are null, assign them sequential values
    let needsInitialization = false;
    const updateData = [];

    allSDs.forEach((sd, index) => {
      if (sd.execution_order === null || sd.execution_order === undefined) {
        needsInitialization = true;
        const newOrder = index + 1;
        updateData.push({
          id: sd.id,
          newOrder: newOrder
        });
        sd.execution_order = newOrder; // Update local copy for later use
      }
    });

    // Apply initialization updates if needed
    if (needsInitialization) {
      console.log(`Initializing execution_order for ${updateData.length} strategic directives`);

      // Execute all initialization updates properly
      for (const update of updateData) {
        const { data, error } = await dbLoader.supabase
          .from('strategic_directives_v2')
          .update({ execution_order: update.newOrder })
          .eq('id', update.id);

        if (error) {
          console.error(`Error initializing execution_order for ${update.id}:`, error);
          throw error;
        }
        console.log(`Initialized ${update.id} with execution_order: ${update.newOrder}`);
      }

      // Re-sort the array after initialization to ensure correct order
      allSDs.sort((a, b) => a.execution_order - b.execution_order);
    }

    // Find the current SD and its position
    const currentIndex = allSDs.findIndex(sd => sd.id === id);

    if (currentIndex === -1) {
      return res.status(404).json({ error: 'Strategic directive not found' });
    }

    // Determine the target index based on direction
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check boundaries
    if (targetIndex < 0 || targetIndex >= allSDs.length) {
      return res.status(400).json({ error: `Cannot move ${direction} - at boundary` });
    }

    // Get the two SDs to swap
    const currentSD = allSDs[currentIndex];
    const targetSD = allSDs[targetIndex];

    console.log(`Swapping ${currentSD.id} (order: ${currentSD.execution_order}) with ${targetSD.id} (order: ${targetSD.execution_order})`);

    // Swap execution_order values - execute updates properly
    const { data: data1, error: error1 } = await dbLoader.supabase
      .from('strategic_directives_v2')
      .update({ execution_order: targetSD.execution_order })
      .eq('id', currentSD.id);

    if (error1) {
      console.error(`Error updating ${currentSD.id}:`, error1);
      throw error1;
    }
    console.log(`Updated ${currentSD.id} to execution_order: ${targetSD.execution_order}`);

    const { data: data2, error: error2 } = await dbLoader.supabase
      .from('strategic_directives_v2')
      .update({ execution_order: currentSD.execution_order })
      .eq('id', targetSD.id);

    if (error2) {
      console.error(`Error updating ${targetSD.id}:`, error2);
      throw error2;
    }
    console.log(`Updated ${targetSD.id} to execution_order: ${currentSD.execution_order}`);

    // Broadcast update to all connected clients
    broadcastUpdate('sd-reordered', {
      movedId: id,
      direction,
      swappedWithId: targetSD.id
    });

    // Return updated strategic directives list
    const updatedSDs = await dbLoader.loadStrategicDirectives();

    // Update dashboard state
    dashboardState.strategicDirectives = updatedSDs;

    // Broadcast the update to all WebSocket clients
    broadcastUpdate('sd-reordered', {
      strategicDirectives: updatedSDs
    });

    res.json({
      success: true,
      strategicDirectives: updatedSDs,
      message: `Strategic directive moved ${direction}`
    });

  } catch (error) {
    console.error('Error reordering strategic directive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get PRD by SD ID
app.get('/api/prd/:sd_id', async (req, res) => {
  try {
    const { sd_id } = req.params;
    const { format = 'json' } = req.query;
    
    // Get latest PRD version
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

// Create Strategic Directive from SDIP submission
app.post('/api/sdip/create-strategic-directive', async (req, res) => {
  try {
    const { submission_id } = req.body;
    console.log('📋 [SERVER] Creating Strategic Directive from submission:', submission_id);

    // Get submission from database
    const submission = await dbLoader.getSubmissionById(submission_id);
    
    if (!submission) {
      return res.status(404).json({
        error: 'Submission not found'
      });
    }

    // Check if Strategic Directive already exists for this submission
    if (submission.gate_status?.resulting_sd_id) {
      console.log('✅ [SERVER] Strategic Directive already exists:', submission.gate_status.resulting_sd_id);
      return res.json({
        success: true,
        sd_id: submission.gate_status.resulting_sd_id,
        redirect_url: `/strategic-directives/${submission.gate_status.resulting_sd_id}`,
        message: 'Strategic Directive already exists',
        existing: true
      });
    }

    // Also check if any existing SD references this submission
    const existingSDs = await dbLoader.getStrategicDirectives();
    const existingSD = existingSDs.find(sd => 
      sd.metadata?.submission_id === submission_id
    );
    
    if (existingSD) {
      console.log('✅ [SERVER] Found existing Strategic Directive:', existingSD.id);
      // Update submission to track the SD
      await dbLoader.updateSubmissionStep(submission_id, 7, {
        status: 'submitted',
        resulting_sd_id: existingSD.id,
        completed_at: existingSD.created_at
      });
      return res.json({
        success: true,
        sd_id: existingSD.id,
        redirect_url: `/strategic-directives/${existingSD.id}`,
        message: 'Strategic Directive already exists',
        existing: true
      });
    }

    // Generate SD ID with proper format
    const timestamp = Date.now();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const sdId = `SD-${year}-${month}${day}-${random}`;

    // Create Strategic Directive data
    const sdData = {
      id: sdId,
      title: submission.intent_summary || 'Strategic Initiative',
      description: submission.final_summary || submission.chairman_input || '',
      status: 'active',
      category: 'strategic_initiative',
      priority: 'medium',
      rationale: submission.chairman_input || '',
      scope: 'Application Enhancement',
      key_changes: [],
      strategic_objectives: [],
      success_criteria: [],
      implementation_guidelines: [],
      dependencies: [],
      risks: [],
      success_metrics: [],
      metadata: {
        source: 'SDIP',
        submission_id: submission.id,
        created_via: 'Directive Lab'
      },
      created_by: 'Chairman',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save to database
    const savedSD = await dbLoader.saveStrategicDirective(sdData);

    // Update submission status
    await dbLoader.updateSubmissionStep(submission_id, 7, {
      status: 'submitted',
      resulting_sd_id: sdId,
      completed_at: new Date().toISOString()
    });

    console.log('✅ [SERVER] Strategic Directive created:', sdId);

    res.json({
      success: true,
      sd_id: sdId,
      redirect_url: `/strategic-directives/${sdId}`,
      message: 'Strategic Directive created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error);
    res.status(500).json({
      error: 'Failed to create Strategic Directive',
      message: error.message
    });
  }
});

// Dashboard API Routes
app.get('/api/status', (req, res) => {
  res.json({
    leoProtocol: dashboardState.leoProtocol,
    context: dashboardState.context,
    progress: dashboardState.progress,
    application: dashboardState.application
  });
});

app.get('/api/state', (req, res) => {
  res.json(dashboardState);
});

// Strategic Directives
app.get('/api/sd', (req, res) => {
  res.json(dashboardState.strategicDirectives);
});

app.get('/api/sd/:id', async (req, res) => {
  const sd = dashboardState.strategicDirectives.find(s => s.id === req.params.id);
  if (sd) {
    res.json(sd);
  } else {
    res.status(404).json({ error: 'Strategic Directive not found' });
  }
});

// Product Requirements Documents
app.get('/api/prd', (req, res) => {
  res.json(dashboardState.prds);
});

app.get('/api/prd/:id', (req, res) => {
  const prd = dashboardState.prds.find(p => p.id === req.params.id);
  if (prd) {
    res.json(prd);
  } else {
    res.status(404).json({ error: 'PRD not found' });
  }
});

// Execution Sequences
app.get('/api/ees', (req, res) => {
  res.json(dashboardState.executionSequences || []);
});

// Context management
app.get('/api/context', (req, res) => {
  res.json(dashboardState.context);
});

// Progress tracking
app.get('/api/progress', (req, res) => {
  res.json(dashboardState.progress);
});

// Handoffs
app.get('/api/handoff', (req, res) => {
  res.json(dashboardState.handoffs);
});

// Create a custom refresh handler for RefreshAPI
const refreshHandler = async () => {
  if (dbLoader.isConnected) {
    console.log('📊 Refreshing dashboard state from database...');
    
    // Load fresh data from database
    const newPRDs = await dbLoader.loadPRDs();
    const newSDs = await dbLoader.loadStrategicDirectives();
    const newEES = await dbLoader.loadExecutionSequences();
    
    // Update the dashboard state
    dashboardState.prds = newPRDs;
    dashboardState.strategicDirectives = newSDs;
    dashboardState.executionSequences = newEES;
    dashboardState.lastRefresh = new Date().toISOString();
    
    console.log(`✅ Dashboard state updated: ${newSDs.length} SDs, ${newPRDs.length} PRDs, ${newEES.length} EES`);
    
    // Broadcast the complete updated state to all connected clients
    broadcastUpdate('state', dashboardState);
    
    return {
      sds: newSDs.length,
      prds: newPRDs.length,
      ees: newEES.length
    };
  }
  throw new Error('Database not connected');
};

// Pass the refresh handler to RefreshAPI
refreshAPI.refreshHandler = refreshHandler;

// Setup RefreshAPI routes (includes /api/system-status, /api/refresh, etc.)
refreshAPI.setupRoutes(app);

// =============================================================================
// APPLICATION FEATURES (Future expansion)
// =============================================================================

// EVA Voice Assistant routes (placeholder for OpenAI Realtime implementation)
app.get('/api/eva/status', (req, res) => {
  res.json({
    enabled: dashboardState.application.features.voiceAssistant,
    message: 'EVA Voice Assistant will be implemented with OpenAI Realtime API'
  });
});

// Portfolio management routes (placeholder)
app.get('/api/portfolio/status', (req, res) => {
  res.json({
    enabled: dashboardState.application.features.portfolio,
    message: 'Portfolio management features coming soon'
  });
});

// =============================================================================
// PR REVIEW SYSTEM (Agentic Review Integration)
// =============================================================================

// Get all PR reviews
app.get('/api/pr-reviews', async (req, res) => {
  try {
    const reviews = await dbLoader.loadPRReviews();
    res.json(reviews || []);
  } catch (error) {
    console.error('Error loading PR reviews:', error);
    res.status(500).json({ error: 'Failed to load PR reviews' });
  }
});

// Get PR review metrics
app.get('/api/pr-reviews/metrics', async (req, res) => {
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
app.post('/api/github/pr-review-webhook', async (req, res) => {
  try {
    const review = req.body;
    console.log('Received PR review webhook:', review.pr_number);

    // Save to database
    await dbLoader.savePRReview(review);

    // Broadcast to dashboard clients
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

// =============================================================================
// OPPORTUNITY MANAGEMENT API ROUTES (SD-1A)
// =============================================================================

// Register all opportunity routes
app.use('/api', opportunitiesRouter);

// =============================================================================
// STORY API ROUTES
// =============================================================================

// Generate stories from PRD
app.post('/api/stories/generate', storiesAPI.generate);

// List stories for an SD
app.get('/api/stories', storiesAPI.list);

// Verify stories (CI webhook)
app.post('/api/stories/verify', storiesAPI.verify);

// Get release gate status
app.get('/api/stories/gate', storiesAPI.releaseGate);

// Story API health check
app.get('/api/stories/health', storiesAPI.health);

// =============================================================================
// INTEGRITY METRICS API
// =============================================================================

// Get latest integrity metrics for dashboard display
app.get('/api/integrity-metrics', async (req, res) => {
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

// Mock metrics endpoint (for backward compatibility)
app.get('/api/metrics', (req, res) => {
  res.json({
    tests: { total: 0, passed: 0, failed: 0 },
    coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
    git: { branch: 'main', uncommittedChanges: 0, lastCommit: '' }
  });
});

// =============================================================================
// CLIENT SERVING
// =============================================================================

// Serve the React app for all other routes (catch-all)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'src/client/dist/index.html'));
});

// =============================================================================
// FILE WATCHING (Development)
// =============================================================================

if (process.env.NODE_ENV !== 'production') {
  // Watch for changes in key directories
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
    await loadState();
    broadcastUpdate('fileChange', { file: filepath });
  });
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

// Setup Supabase realtime subscriptions
if (dbLoader.isConnected && realtimeManager.isConnected) {
  // Subscribe to Strategic Directive changes
  realtimeManager.subscribeToSDs((payload) => {
    console.log('📡 Realtime update: Strategic Directive');
    loadState().then(() => {
      broadcastUpdate('database', { table: 'strategic_directives_v2', payload });
    });
  });

  // Subscribe to PRD changes
  realtimeManager.subscribeToPRDs((payload) => {
    console.log('📡 Realtime update: PRD');
    loadState().then(() => {
      broadcastUpdate('database', { table: 'product_requirements_v2', payload });
    });
  });

  // Subscribe to Execution Sequence changes
  realtimeManager.subscribeToEES((payload) => {
    console.log('📡 Realtime update: Execution Sequence');
    loadState().then(() => {
      broadcastUpdate('database', { table: 'execution_sequences_v2', payload });
    });
  });

  // Subscribe to Integrity Metrics changes
  realtimeManager.subscribeToIntegrityMetrics((payload) => {
    console.log('📡 Realtime update: Integrity Metrics');
    broadcastUpdate('integrity-metrics', payload);
  });
}

// =============================================================================
// DATABASE MIGRATION
// =============================================================================

async function checkNavigationShortcutsSchema() {
  if (!dbLoader.isConnected) {
    console.log('⚠️ Database not connected - navigation shortcuts will use localStorage fallback');
    return false;
  }

  try {
    console.log('🔍 Checking navigation shortcuts database schema...');

    // Test if navigation_shortcuts table exists by querying it
    const { data, error } = await dbLoader.supabase
      .from('navigation_shortcuts')
      .select('id')
      .limit(1);

    if (error) {
      console.log('📋 Navigation shortcuts tables not found');
      console.log('💡 To enable database persistence:');
      console.log('   1. Run: node scripts/setup-navigation-shortcuts-db.js');
      console.log('   2. Execute the SQL in Supabase Dashboard');
      console.log('   3. Restart the server');
      console.log('⚡ Using localStorage fallback for now');
      return false;
    } else {
      console.log('✅ Navigation shortcuts database schema ready');

      // Test if we can call the database functions
      try {
        const { data: testData, error: funcError } = await dbLoader.supabase
          .rpc('get_user_shortcuts');

        if (funcError) {
          console.log('⚠️ Database functions not available, using localStorage fallback');
          return false;
        } else {
          console.log('✅ Database functions ready, full persistence enabled');
          return true;
        }
      } catch (funcErr) {
        console.log('⚠️ Database functions test failed, using localStorage fallback');
        return false;
      }
    }
  } catch (err) {
    console.log('⚠️ Database schema check failed:', err.message);
    console.log('⚡ Using localStorage fallback');
    return false;
  }
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  await loadState();
  const dbSchemaReady = await checkNavigationShortcutsSchema();

  // Initialize STORY agent if enabled
  if (process.env.FEATURE_STORY_AGENT === 'true') {
    const storyBootstrap = new StoryAgentBootstrap();
    await storyBootstrap.initialize();
    console.log('🎯 STORY Agent initialized');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n=============================================================');
    console.log('🚀 EHG_Engineer Unified Application Server');
    console.log('=============================================================');
    console.log(`📍 Local:            http://localhost:${PORT}`);
    console.log(`📍 Network:          http://0.0.0.0:${PORT}`);
    console.log(`📊 Dashboard:        http://localhost:${PORT}/dashboard`);
    console.log(`🎙️  EVA Voice:       http://localhost:${PORT}/eva (coming soon)`);
    console.log(`💼 Portfolio:        http://localhost:${PORT}/portfolio (coming soon)`);
    console.log('-------------------------------------------------------------');
    console.log(`✅ Database:        ${dbLoader.isConnected ? 'Connected' : 'Not connected'}`);
    console.log(`📋 LEO Protocol:    ${dashboardState.leoProtocol.version}`);
    console.log(`🔍 Strategic Dirs:  ${dashboardState.strategicDirectives.length} loaded`);
    console.log(`📄 PRDs:            ${dashboardState.prds.length} loaded`);
    console.log(`⚡ Realtime:        ${realtimeManager.isConnected ? 'Active' : 'Inactive'}`);
    console.log('=============================================================\n');
    
    // Check for SD-2025-001
    const sd2025 = dashboardState.strategicDirectives.find(sd => sd.id === 'SD-2025-001');
    if (sd2025) {
      console.log('✨ SD-2025-001 (OpenAI Realtime Voice) is loaded and ready!');
    }
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