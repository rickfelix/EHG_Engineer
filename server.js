#!/usr/bin/env node

/**
 * EHG_Engineer Backend API Server
 * SD-ARCH-EHG-007: Backend API + LEO Protocol engine (no standalone UI)
 * All UI is in EHG unified frontend at port 8080
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
import { spawn } from 'child_process';

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

// Import Directive Enhancement Service
import { DirectiveEnhancer } from './src/services/directive-enhancer.js';

// Import RCA Monitor Bootstrap (SD-RCA-001)
import { bootstrapRCAMonitoring, registerRCAShutdownHandlers } from './lib/rca-monitor-bootstrap.js';

// SOVEREIGN PIPE v3.7.0: Calibration and Error Handling
import { getCalibrationService } from './src/services/CalibrationService.js';
import { createEvaErrorHandler, asyncHandler } from './lib/middleware/eva-error-handler.js';
import { requireVentureScope, requireChairmanForGlobal } from './src/middleware/venture-scope.js';

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

// Global WebSocket clients tracking for refresh API
global.wsClients = new Set();

// Simple in-memory cache for AI backlog summaries (1 hour TTL)
const backlogSummaryCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Initialize components
const dbLoader = new DatabaseLoader();
const realtimeManager = new RealtimeManager();
const refreshAPI = new RefreshAPI(server, dbLoader);
const versionDetector = new LEOVersionDetector();
const realtimeDashboard = new RealtimeDashboard(dbLoader);

// Initialize OpenAI if API key is provided
let openai = null;
let directiveEnhancer = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI integration enabled');

  // Initialize Directive Enhancement Service
  directiveEnhancer = new DirectiveEnhancer(openai, dbLoader);
  console.log('✅ Directive Enhancement Service enabled');
} else {
  console.log('⚠️ OpenAI API key not found - AI features will use fallback mode');
}

// Middleware
// SD-ARCH-EHG-007: Configure CORS for EHG unified frontend access
// Note: EHG_Engineer is backend API only - no separate frontend client
app.use(cors({
  origin: [
    'http://localhost:8080',  // EHG unified frontend (Vite)
    'http://localhost:8081',  // EHG fallback port
    /^https:\/\/.*\.ehg\.com$/  // Production EHG domains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json());

// SD-ARCH-EHG-007: Static file serving removed - all UI is in EHG unified frontend
// EHG_Engineer is backend API only (port 3000)

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
      console.log('📨 WebSocket message received:', msg.type, msg.data ? JSON.stringify(msg.data) : '');

      if (msg.type === 'setActiveSD') {
        const { sdId } = msg.data;
        console.log(`🎯 Setting active SD to: ${sdId}`);

        // First, clear is_working_on flag from all SDs
        if (!dbLoader.supabase) {
          console.error('❌ dbLoader.supabase is not initialized!');
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Database connection not initialized'
          }));
          return;
        }

        const { error: clearError } = await dbLoader.supabase
          .from('strategic_directives_v2')
          .update({ is_working_on: false })
          .eq('is_working_on', true);

        if (clearError) {
          console.error('❌ Error clearing working_on flags:', clearError);
        }

        // Then set the new active SD
        const { error: setError } = await dbLoader.supabase
          .from('strategic_directives_v2')
          .update({ is_working_on: true })
          .eq('id', sdId);

        if (setError) {
          console.error('❌ Error setting working_on flag:', setError);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Failed to set active SD: ${setError.message}`
          }));
        } else {
          console.log(`✅ Successfully set ${sdId} as working_on`);

          // Update local state
          dashboardState.leoProtocol.currentSD = sdId;

          // Reload strategic directives to get updated is_working_on flags
          dashboardState.strategicDirectives = await dbLoader.loadStrategicDirectives();

          // Broadcast the updated state to all clients
          broadcastUpdate('state', dashboardState);
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
      } else if (msg.type === 'updateSDPriority') {
        const { sdId, priority } = msg.data;
        console.log(`🎯 Updating SD ${sdId} priority to: ${priority}`);

        // Update in database
        const { error } = await dbLoader.supabase
          .from('strategic_directives_v2')
          .update({ priority })
          .eq('id', sdId);

        if (error) {
          console.error('❌ Error updating SD priority:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Failed to update priority: ${error.message}`
          }));
        } else {
          console.log(`✅ Successfully updated ${sdId} priority to ${priority}`);

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

    // NEW: Trigger background enhancement (non-blocking, invisible to chairman)
    if (directiveEnhancer && result.chairman_input) {
      setImmediate(async () => {
        try {
          console.log('🔄 [ENHANCER] Starting background enhancement for submission:', result.id);
          const enhancement = await directiveEnhancer.enhance(result);

          if (enhancement) {
            // Store enhancement data in existing columns
            await dbLoader.updateSubmissionStep(result.id, 1, {
              intent_summary: enhancement.intent,  // Store extracted intent (80 words)
              questions: enhancement.questions,     // Store decision-shaping questions
              final_summary: enhancement.comprehensiveDescription,  // Store comprehensive description (200-300 words)
              synthesis_data: {                     // Store codebase findings + enhanced SD structure
                codebaseFindings: enhancement.codebaseFindings,
                enhancedSD: enhancement.enhancedSD,
                enhanced_at: enhancement.enhanced_at
              }
            });
            console.log('✅ [ENHANCER] Background enhancement complete for submission:', result.id);
            console.log('📝 [ENHANCER] Intent extracted:', enhancement.intent?.substring(0, 80) + '...');
            console.log('📄 [ENHANCER] Comprehensive description:', enhancement.comprehensiveDescription?.length || 0, 'characters');
            console.log('❓ [ENHANCER] Questions generated:', enhancement.questions?.length || 0);
            console.log('🔍 [ENHANCER] Components found:', enhancement.codebaseFindings?.components?.length || 0);
          }
        } catch (enhanceError) {
          console.error('⚠️ [ENHANCER] Background enhancement failed:', enhanceError.message);
          // Don't block user flow - enhancement is optional
        }
      });
    }

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
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an expert at extracting clear, actionable intent from user feedback. Extract the main intent or goal from the following feedback in 1-2 clear sentences. Focus on what the user wants to achieve or improve.'
              },
              {
                role: 'user',
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

// Generate AI summary for SD backlog items
app.get('/api/strategic-directives/:sd_id/backlog-summary', async (req, res) => {
  try {
    const { sd_id } = req.params;
    const { force_refresh } = req.query; // Add support for forcing refresh

    if (!openai) {
      return res.status(503).json({
        error: 'AI service not available',
        fallback: 'OpenAI API key not configured'
      });
    }

    // Check database first (unless force refresh is requested)
    if (!force_refresh) {
      const { data: sdData, error: sdError } = await dbLoader.supabase
        .from('strategic_directives_v2')
        .select('backlog_summary, backlog_summary_generated_at')
        .eq('id', sd_id)
        .single();

      if (!sdError && sdData?.backlog_summary) {
        console.log(`📚 Returning database-stored summary for SD ${sd_id}`);
        return res.json({
          summary: sdData.backlog_summary,
          generated_at: sdData.backlog_summary_generated_at,
          from_database: true
        });
      }
    }

    // Get SD details first for context
    const { data: sdData, error: sdError } = await dbLoader.supabase
      .from('strategic_directives_v2')
      .select('title, description')
      .eq('id', sd_id)
      .single();

    if (sdError) {
      console.error('Error fetching SD details:', sdError);
    }

    // Get backlog items for this SD - fetch ALL fields for comprehensive summaries
    const { data: backlogItems, error } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sd_id)
      .eq('present_in_latest_import', true);

    if (error) {
      console.error('Error fetching backlog items:', error);
      return res.status(500).json({ error: 'Failed to fetch backlog data' });
    }

    if (!backlogItems || backlogItems.length === 0) {
      return res.json({
        summary: 'No backlog items found for this strategic directive.',
        itemCount: 0,
        cached: false
      });
    }

    // Combine SD context with backlog items
    let contextText = '';

    // Add SD title and description as context
    if (sdData) {
      contextText += `Strategic Directive: ${sdData.title}\n`;
      if (sdData.description) {
        contextText += `Description: ${sdData.description}\n\n`;
      }
    }

    // Combine all backlog item data - use ALL description fields available
    const backlogDetails = backlogItems
      .map(item => {
        const parts = [];

        // Add backlog title
        if (item.backlog_title) {
          parts.push(`Title: ${item.backlog_title}`);
        }

        // Add all description fields
        if (item.item_description && item.item_description.trim()) {
          parts.push(`Item Description: ${item.item_description}`);
        }

        if (item.description_raw && item.description_raw.trim()) {
          parts.push(`Raw Description: ${item.description_raw}`);
        }

        if (item.story_description && item.story_description.trim()) {
          parts.push(`Story Description: ${item.story_description}`);
        }

        // Extract ALL fields from extras JSON
        if (item.extras) {
          try {
            const extras = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;

            // Add Description_1 if present
            if (extras.Description_1) {
              parts.push(`Detailed Description: ${extras.Description_1}`);
            }

            // Add any other description-like fields from extras
            Object.keys(extras).forEach(key => {
              if (key.toLowerCase().includes('desc') && key !== 'Description_1' && extras[key]) {
                parts.push(`${key}: ${extras[key]}`);
              }
            });

            // Add important metadata from extras
            if (extras['Page Title_1']) parts.push(`Page: ${extras['Page Title_1']}`);
            if (extras['Category']) parts.push(`Category: ${extras['Category']}`);
          } catch (e) {
            console.error('Error parsing extras:', e);
          }
        }

        // Add other relevant fields
        if (item.priority) parts.push(`Priority: ${item.priority}`);
        if (item.phase) parts.push(`Phase: ${item.phase}`);
        if (item.stage_number) parts.push(`Stage: ${item.stage_number}`);
        if (item.story_title && item.story_title !== item.backlog_title) {
          parts.push(`Story: ${item.story_title}`);
        }
        if (item.my_comments && item.my_comments.trim()) {
          parts.push(`Comments: ${item.my_comments}`);
        }
        if (item.acceptance_criteria) {
          parts.push(`Acceptance Criteria: ${item.acceptance_criteria}`);
        }

        return parts.length > 0 ? parts.join('; ') : null;
      })
      .filter(text => text !== null)
      .join('\n\n');  // Double newline for better separation

    // If backlog items have no meaningful content, use SD context
    const fullContext = contextText + (backlogDetails || `${backlogItems.length} backlog items with limited details available.`);

    // Generate AI summary
    try {
      console.log(`🤖 Generating backlog summary for SD ${sd_id}...`);
      console.log(`   Using context: ${fullContext.substring(0, 200)}...`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert technical analyst creating detailed summaries of software development backlogs. Focus on extracting specific technical details, features, and implementation requirements from all available descriptions.'
          },
          {
            role: 'user',
            content: `Analyze this strategic directive with ${backlogItems.length} backlog items:\n\n${fullContext}\n\nCreate exactly 7 sentences that:\n1. Identify the core technical capabilities and specific features being built\n2. Highlight the highest priority items with their implementation details\n3. Describe the technical architecture, technologies, and integration points mentioned\n4. Note specific risks, dependencies, or technical challenges found in descriptions\n5. Summarize expected deliverables and measurable business outcomes\n6. Identify implementation phases, stages, and technical milestones\n7. Assess technical complexity, resource needs, and readiness based on all descriptions\n\nBe specific - mention actual features, technologies, and requirements found in the descriptions.`
          }
        ],
        max_tokens: 400,
        temperature: 0.3
      });

      const summary = completion.choices[0].message.content.trim();
      const generated_at = new Date().toISOString();

      // Store in database for permanent storage
      const { error: updateError } = await dbLoader.supabase
        .from('strategic_directives_v2')
        .update({
          backlog_summary: summary,
          backlog_summary_generated_at: generated_at
        })
        .eq('id', sd_id);

      if (updateError) {
        console.warn('⚠️ Failed to save summary to database:', updateError.message);
      } else {
        console.log(`💾 Saved summary to database for SD ${sd_id}`);
      }

      const responseData = {
        summary,
        itemCount: backlogItems.length,
        generated_at,
        from_database: false
      };

      res.json(responseData);

    } catch (aiError) {
      console.error('OpenAI Error:', aiError);
      return res.status(500).json({
        error: 'AI summarization failed',
        fallback: `Contains ${backlogItems.length} backlog items covering various technical requirements and implementation details.`
      });
    }

  } catch (error) {
    console.error('API Error:', error);
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
    const { submission_id, priority } = req.body;
    console.log('📋 [SERVER] Creating Strategic Directive from submission:', submission_id);
    console.log('📋 [SERVER] Priority from request:', priority || 'medium (default)');

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
    const existingSDs = await dbLoader.loadStrategicDirectives();
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

    // Get enhanced data from synthesis_data (from automated enhancement)
    const enhancedSD = submission.synthesis_data?.enhancedSD || {};
    const questions = submission.questions || [];

    // Create Strategic Directive data using enhanced intelligence
    const rawTitle = enhancedSD.title || submission.intent_summary || 'Strategic Initiative';
    const sdData = {
      id: sdId,
      sd_key: sdId, // Required field - same as id
      title: rawTitle.substring(0, 500), // Truncate to database limit
      description: submission.final_summary || submission.intent_summary || submission.chairman_input || '',
      status: 'active',
      category: 'strategic_initiative',
      priority: priority || 'high',
      rationale: enhancedSD.rationale || submission.chairman_input || '',
      scope: 'Application Enhancement',
      key_changes: enhancedSD.key_constraints || [],
      strategic_objectives: [],
      success_criteria: enhancedSD.success_criteria || [],
      implementation_guidelines: [],
      dependencies: enhancedSD.dependencies || [],
      risks: enhancedSD.risks || [],
      success_metrics: enhancedSD.acceptance_signals || [],
      metadata: {
        source: 'SDIP',
        submission_id: submission.id,
        created_via: 'Directive Lab',
        target_application: enhancedSD.target_application || 'EHG',
        estimated_complexity: enhancedSD.estimated_complexity || 'medium',
        ai_enhanced: true,
        enhancement_timestamp: submission.synthesis_data?.enhanced_at || null,
        decision_questions: questions,
        codebase_findings: submission.synthesis_data?.codebaseFindings || null
      },
      created_by: 'Chairman',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('📋 [SERVER] Using enhanced SD data:');
    console.log('  - Title:', sdData.title);
    console.log('  - Success Criteria:', sdData.success_criteria.length, 'items');
    console.log('  - Dependencies:', sdData.dependencies.length, 'items');
    console.log('  - Risks:', sdData.risks.length, 'items');
    console.log('  - Questions:', questions.length, 'questions');
    console.log('  - Target App:', sdData.metadata.target_application);
    console.log('  - Complexity:', sdData.metadata.estimated_complexity);

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
// AI OPPORTUNITY DISCOVERY API
// SD: AI-Generated Venture Idea Discovery
// =============================================================================

// Lazy-load discovery service (avoid startup cost if not used)
let _discoveryService = null;
async function getDiscoveryService() {
  if (!_discoveryService) {
    const { default: OpportunityDiscoveryService } = await import('./lib/discovery/opportunity-discovery-service.js');
    _discoveryService = new OpportunityDiscoveryService();
  }
  return _discoveryService;
}

/**
 * POST /api/discovery/scan
 * Trigger a new opportunity discovery scan
 * Body: { scan_type: 'competitor', target_url: 'https://...', target_market?: string }
 */
app.post('/api/discovery/scan', async (req, res) => {
  try {
    const { scan_type, target_url, target_market } = req.body;

    if (!scan_type) {
      return res.status(400).json({ error: 'scan_type is required' });
    }

    if (scan_type === 'competitor' && !target_url) {
      return res.status(400).json({ error: 'target_url is required for competitor scans' });
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
 * Query: ?box=green|yellow|red&status=pending|approved|rejected&minScore=70&scanId=uuid
 */
app.get('/api/discovery/opportunities', async (req, res) => {
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
 * Query: ?limit=10
 */
app.get('/api/discovery/scans', async (req, res) => {
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
 * Body: { blueprint_id: uuid, decision: 'approved'|'rejected', feedback?: string }
 */
app.post('/api/discovery/decision', async (req, res) => {
  try {
    const { blueprint_id, decision, feedback } = req.body;

    if (!blueprint_id || !decision) {
      return res.status(400).json({ error: 'blueprint_id and decision are required' });
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
 * Query: ?source=ai_generated|manual|all&box=green|yellow|red&status=pending|approved|rejected
 */
app.get('/api/blueprints', async (req, res) => {
  try {
    const { source, box, status, limit = 50 } = req.query;

    let query = dbLoader.supabase
      .from('opportunity_blueprints')
      .select('*')
      .eq('is_active', true);

    // Apply filters
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
app.get('/api/blueprints/:id', async (req, res) => {
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
// SOVEREIGN PIPE v3.7.0: CALIBRATION API
// =============================================================================

/**
 * GET /api/calibration/venture/:venture_id
 * Get calibration score for a specific venture
 */
app.get('/api/calibration/venture/:venture_id', requireVentureScope, asyncHandler(async (req, res) => {
  const calibrationService = getCalibrationService();
  const result = await calibrationService.getVentureCalibration(req.venture_id);

  if (!result.success) {
    return res.status(404).json({
      alert: 'Venture calibration not found',
      severity: 'MEDIUM',
      category: 'CALIBRATION',
      error: result.error
    });
  }

  res.json(result);
}));

/**
 * GET /api/calibration/threshold/:sd_id
 * Get adaptive threshold for a strategic directive
 */
app.get('/api/calibration/threshold/:sd_id', asyncHandler(async (req, res) => {
  const { sd_id } = req.params;
  const { gate_number = 1 } = req.query;

  // Get SD from state
  const sd = dashboardState.strategicDirectives.find(s => s.id === sd_id);
  if (!sd) {
    return res.status(404).json({
      alert: 'Strategic directive not found',
      severity: 'MEDIUM',
      category: 'VALIDATION'
    });
  }

  const calibrationService = getCalibrationService();
  const result = calibrationService.calculateAdaptiveThreshold({
    sd,
    priorGateScores: [],
    patternStats: null,
    gateNumber: parseInt(gate_number)
  });

  res.json({
    sd_id,
    gate_number: parseInt(gate_number),
    threshold: result.finalThreshold,
    breakdown: result.breakdown,
    reasoning: result.reasoning
  });
}));

/**
 * POST /api/calibration/compute
 * Compute 60/40 Truth Delta
 */
app.post('/api/calibration/compute', asyncHandler(async (req, res) => {
  const { business_accuracy, technical_accuracy, vertical } = req.body;

  if (business_accuracy === undefined || technical_accuracy === undefined) {
    return res.status(400).json({
      alert: 'Missing required fields',
      severity: 'MEDIUM',
      category: 'VALIDATION',
      diagnosis: ['Provide business_accuracy (0-1)', 'Provide technical_accuracy (0-1)']
    });
  }

  const calibrationService = getCalibrationService();

  // Compute 60/40 Truth Delta
  const truthDelta = calibrationService.computeTruthDelta(
    parseFloat(business_accuracy),
    parseFloat(technical_accuracy)
  );

  // Optionally normalize by vertical
  let normalized = null;
  if (vertical) {
    normalized = await calibrationService.normalizeCalibrationDelta(
      truthDelta.truth_delta,
      vertical
    );
  }

  res.json({
    truth_delta: truthDelta,
    normalized: normalized
  });
}));

/**
 * GET /api/calibration/portfolio
 * Calibrate entire portfolio (Chairman only)
 */
app.get('/api/calibration/portfolio', requireChairmanForGlobal, asyncHandler(async (req, res) => {
  const calibrationService = getCalibrationService();
  const result = await calibrationService.calibratePortfolio();

  if (!result.success) {
    return res.status(500).json({
      alert: 'Portfolio calibration failed',
      severity: 'HIGH',
      category: 'CALIBRATION',
      error: result.error
    });
  }

  res.json(result);
}));

// =============================================================================
// TESTING CAMPAIGN API
// =============================================================================

let activeCampaignProcess = null;

// Get campaign status from heartbeat file
app.get('/api/testing/campaign/status', (req, res) => {
  try {
    const heartbeatPath = '/tmp/campaign-heartbeat.txt';
    if (fs.existsSync(heartbeatPath)) {
      const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
      res.json({
        running: heartbeat.status === 'running',
        status: heartbeat.status,
        targetApplication: heartbeat.target_application || 'EHG',
        progress: heartbeat.progress,
        percent: heartbeat.percent,
        currentSD: heartbeat.current_sd,
        lastUpdate: heartbeat.iso_time,
        pid: heartbeat.pid
      });
    } else {
      res.json({
        running: false,
        status: 'not_started',
        targetApplication: null,
        progress: '0/0',
        percent: 0,
        currentSD: null,
        lastUpdate: null,
        pid: null
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get health report
app.get('/api/testing/campaign/health', (req, res) => {
  try {
    const heartbeatPath = '/tmp/campaign-heartbeat.txt';
    const checkpointPath = '/tmp/campaign-checkpoint.json';
    const statusPath = '/tmp/campaign-status.json';
    const alertsPath = '/tmp/campaign-alerts.log';

    const heartbeat = fs.existsSync(heartbeatPath)
      ? JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'))
      : null;

    const checkpoint = fs.existsSync(checkpointPath)
      ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
      : null;

    const status = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath, 'utf8'))
      : null;

    const alerts = fs.existsSync(alertsPath)
      ? fs.readFileSync(alertsPath, 'utf8').trim().split('\n').slice(-10)
      : [];

    // Check if process is alive
    let processAlive = false;
    if (heartbeat?.pid) {
      try {
        process.kill(heartbeat.pid, 0);
        processAlive = true;
      } catch (e) {
        processAlive = false;
      }
    }

    res.json({
      heartbeat,
      checkpoint,
      status,
      alerts,
      processAlive,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SD counts by application
app.get('/api/testing/campaign/apps', async (req, res) => {
  try {
    // Query database for counts
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from('v_untested_sds')
      .select('target_application, tested, status');

    if (error) throw error;

    // Group by application
    const apps = {
      EHG: { total: 0, tested: 0, untested: 0, completed: 0 },
      EHG_Engineer: { total: 0, tested: 0, untested: 0, completed: 0 }
    };

    data.forEach(sd => {
      const app = sd.target_application || 'EHG';
      if (apps[app]) {
        apps[app].total++;
        if (sd.status === 'completed') apps[app].completed++;
        if (sd.tested) {
          apps[app].tested++;
        } else if (sd.status === 'completed') {
          apps[app].untested++;
        }
      }
    });

    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start campaign
app.post('/api/testing/campaign/start', (req, res) => {
  try {
    const targetApp = req.body.targetApplication || 'EHG';
    const smokeOnly = req.body.smokeOnly === true;

    if (!['EHG', 'EHG_Engineer'].includes(targetApp)) {
      return res.status(400).json({ error: 'Invalid target application' });
    }

    if (activeCampaignProcess) {
      return res.status(400).json({ error: 'Campaign already running' });
    }

    const modeLabel = smokeOnly ? 'FAST MODE (smoke-only)' : 'Full Testing';
    console.log(`🚀 Starting testing campaign for ${targetApp} - ${modeLabel}...`);

    // Launch campaign process with optional smoke-only flag
    const args = [path.join(PROJECT_ROOT, 'scripts/start-testing-campaign.cjs'), targetApp];
    if (smokeOnly) {
      args.push('--smoke-only');
    }

    activeCampaignProcess = spawn(
      'node',
      args,
      {
        detached: true,
        stdio: 'ignore'
      }
    );

    activeCampaignProcess.unref();

    // Give it a moment to start
    setTimeout(() => {
      const heartbeatPath = '/tmp/campaign-heartbeat.txt';
      if (fs.existsSync(heartbeatPath)) {
        const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
        res.json({
          started: true,
          pid: heartbeat.pid,
          targetApplication: targetApp
        });
      } else {
        res.json({
          started: true,
          pid: activeCampaignProcess.pid,
          targetApplication: targetApp
        });
      }
    }, 1000);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop campaign
app.post('/api/testing/campaign/stop', (req, res) => {
  try {
    // Read heartbeat to get PID
    const heartbeatPath = '/tmp/campaign-heartbeat.txt';
    if (!fs.existsSync(heartbeatPath)) {
      return res.status(404).json({ error: 'No active campaign found' });
    }

    const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
    const pid = heartbeat.pid;

    if (pid) {
      console.log(`🛑 Stopping campaign (PID: ${pid})...`);

      try {
        // Try to kill the process
        process.kill(pid, 'SIGTERM');
      } catch (killError) {
        // Process might already be dead
        console.log(`⚠️ Process ${pid} not found (already stopped)`);
      }

      // Clean up campaign files regardless
      try {
        if (fs.existsSync(heartbeatPath)) fs.unlinkSync(heartbeatPath);
        if (fs.existsSync('/tmp/campaign-checkpoint.json')) fs.unlinkSync('/tmp/campaign-checkpoint.json');
        console.log('🧹 Cleaned up campaign files');
      } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError.message);
      }

      activeCampaignProcess = null;
      res.json({ stopped: true, pid, cleaned: true });
    } else {
      res.status(404).json({ error: 'No PID found' });
    }
  } catch (error) {
    // Even if we error, try to clean up
    try {
      const heartbeatPath = '/tmp/campaign-heartbeat.txt';
      if (fs.existsSync(heartbeatPath)) fs.unlinkSync(heartbeatPath);
      if (fs.existsSync('/tmp/campaign-checkpoint.json')) fs.unlinkSync('/tmp/campaign-checkpoint.json');
    } catch (e) {}

    res.status(500).json({ error: error.message });
  }
});

// Get logs
app.get('/api/testing/campaign/logs/:type', (req, res) => {
  try {
    const logType = req.params.type;
    const limit = parseInt(req.query.limit) || 100;

    let logPath;
    switch (logType) {
      case 'progress':
        logPath = '/tmp/batch-test-progress.log';
        break;
      case 'errors':
        logPath = '/tmp/batch-test-errors.log';
        break;
      case 'alerts':
        logPath = '/tmp/campaign-alerts.log';
        break;
      default:
        return res.status(400).json({ error: 'Invalid log type' });
    }

    if (!fs.existsSync(logPath)) {
      return res.json({ lines: [] });
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').slice(-limit);

    res.json({ lines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// VENTURES API
// =============================================================================

// Get all ventures
app.get('/api/ventures', asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ventures:', error);
    return res.status(500).json({ error: error.message });
  }

  // Map stage enum to numeric value if needed
  const ventures = (data || []).map(v => ({
    ...v,
    stage: v.current_stage || v.current_workflow_stage || 1
  }));

  res.json(ventures);
}));

// Get single venture by ID
app.get('/api/ventures/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching venture:', error);
    return res.status(404).json({ error: 'Venture not found' });
  }

  // Map stage to numeric value
  const venture = {
    ...data,
    stage: data.current_stage || data.current_workflow_stage || 1
  };

  res.json(venture);
}));

// Get artifacts for a venture
app.get('/api/ventures/:id/artifacts', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage } = req.query; // Optional: filter by specific stage

  // Query venture_artifacts table
  let query = dbLoader.supabase
    .from('venture_artifacts')
    .select('*')
    .eq('venture_id', id)
    .eq('is_current', true)
    .order('lifecycle_stage', { ascending: true });

  // Filter by stage if provided
  if (stage) {
    query = query.eq('lifecycle_stage', parseInt(stage));
  }

  const { data: artifacts, error: artifactsError } = await query;

  if (!artifactsError && artifacts && artifacts.length > 0) {
    // Transform to consistent format for frontend
    const formattedArtifacts = artifacts.map(a => ({
      id: a.id,
      venture_id: a.venture_id,
      stage: a.lifecycle_stage,
      type: a.artifact_type,
      title: a.title,
      content: a.content,
      summary: a.metadata?.summary || a.title,
      file_url: a.file_url,
      version: a.version,
      epistemic_classification: a.epistemic_classification,
      created_at: a.created_at,
      updated_at: a.updated_at
    }));
    return res.json(formattedArtifacts);
  }

  // Fallback to venture_stage_work table for stage progress info
  const { data: stageWork, error: stageError } = await dbLoader.supabase
    .from('venture_stage_work')
    .select('*')
    .eq('venture_id', id)
    .order('lifecycle_stage', { ascending: true });

  if (stageError) {
    console.error('Error fetching stage work:', stageError);
    return res.json([]);
  }

  // Transform stage_work to artifact-like format
  const formattedWork = (stageWork || []).map(sw => ({
    id: sw.id,
    venture_id: sw.venture_id,
    stage: sw.lifecycle_stage,
    type: sw.work_type || 'stage_work',
    title: `Stage ${sw.lifecycle_stage} Work`,
    status: sw.stage_status,
    health_score: sw.health_score,
    advisory_data: sw.advisory_data,
    started_at: sw.started_at,
    completed_at: sw.completed_at
  }));

  res.json(formattedWork);
}));

// Update venture stage
app.patch('/api/ventures/:id/stage', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;

  if (!stage || stage < 1 || stage > 25) {
    return res.status(400).json({ error: 'Invalid stage. Must be 1-25.' });
  }

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .update({
      current_stage: stage,
      current_workflow_stage: stage
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating venture stage:', error);
    return res.status(500).json({ error: error.message });
  }

  // Map stage to numeric value
  const venture = {
    ...data,
    stage: data.current_stage || data.current_workflow_stage || 1
  };

  res.json(venture);
}));

// Create or update artifact for a venture stage
app.post('/api/ventures/:id/artifacts', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage, artifact_type, title, content, metadata } = req.body;

  if (!stage || !artifact_type || !title) {
    return res.status(400).json({
      error: 'Missing required fields: stage, artifact_type, title'
    });
  }

  // Mark existing artifacts of this type as not current
  await dbLoader.supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('venture_id', id)
    .eq('lifecycle_stage', stage)
    .eq('artifact_type', artifact_type);

  // Get next version number
  const { data: existing } = await dbLoader.supabase
    .from('venture_artifacts')
    .select('version')
    .eq('venture_id', id)
    .eq('lifecycle_stage', stage)
    .eq('artifact_type', artifact_type)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version || 0) + 1;

  // Insert new artifact
  const { data, error } = await dbLoader.supabase
    .from('venture_artifacts')
    .insert({
      venture_id: id,
      lifecycle_stage: stage,
      artifact_type,
      title,
      content,
      metadata: metadata || {},
      version: nextVersion,
      is_current: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating artifact:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({
    id: data.id,
    venture_id: data.venture_id,
    stage: data.lifecycle_stage,
    type: data.artifact_type,
    title: data.title,
    content: data.content,
    version: data.version,
    created_at: data.created_at
  });
}));

// Create new venture - IDEATION-GENESIS-AUDIT: Capture raw Chairman intent
app.post('/api/ventures', asyncHandler(async (req, res) => {
  const ventureData = req.body;

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .insert({
      name: ventureData.name,
      description: ventureData.description,
      problem_statement: ventureData.problem_statement,
      // IDEATION-GENESIS-AUDIT: Capture immutable Chairman vision
      raw_chairman_intent: ventureData.problem_statement,
      problem_statement_locked_at: new Date().toISOString(),
      solution: ventureData.solution,
      target_market: ventureData.target_market,
      origin_type: ventureData.origin_type || 'manual',
      competitor_ref: ventureData.competitor_ref || null,
      current_lifecycle_stage: 1,
      workflow_status: 'pending',
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating venture:', error);
    return res.status(500).json({ error: error.message });
  }

  const venture = {
    ...data,
    stage: data.current_lifecycle_stage || 1
  };

  res.status(201).json(venture);
}));

// Competitor Analysis - IDEATION-GENESIS-AUDIT: Real market intelligence
app.post('/api/competitor-analysis', asyncHandler(async (req, res) => {
  const { url, include_full_analysis = false } = req.body;

  // Validate URL
  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  try {
    new URL(url); // Validates URL format
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format'
    });
  }

  try {
    // Dynamic import of the competitor intelligence service
    const { default: CompetitorIntelligenceService } = await import('./lib/research/competitor-intelligence.js');
    const service = new CompetitorIntelligenceService();

    console.log(`[competitor-analysis] Analyzing: ${url}`);
    const startTime = Date.now();

    // Perform REAL analysis
    const analysis = await service.analyzeCompetitor(url);

    console.log(`[competitor-analysis] Complete in ${Date.now() - startTime}ms`);

    // Build response
    const response = {
      success: true,
      venture: {
        name: analysis.name,
        problem_statement: analysis.problem_statement,
        solution: analysis.solution,
        target_market: analysis.target_market,
        competitor_reference: analysis.competitor_reference
      },
      four_buckets_summary: {
        facts_count: analysis.four_buckets?.facts?.length || 0,
        assumptions_count: analysis.four_buckets?.assumptions?.length || 0,
        simulations_count: analysis.four_buckets?.simulations?.length || 0,
        unknowns_count: analysis.four_buckets?.unknowns?.length || 0
      },
      quality: analysis.quality,
      metadata: analysis.metadata
    };

    // Include full analysis if requested
    if (include_full_analysis) {
      response.full_analysis = {
        four_buckets: analysis.four_buckets,
        competitive_intelligence: analysis.competitive_intelligence
      };
    }

    res.json(response);

  } catch (error) {
    console.error('[competitor-analysis] Error:', error);

    // Return fallback with error info
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }

    res.json({
      success: true,
      venture: {
        name: `${domain.replace('www.', '').split('.')[0].toUpperCase()} Alternative`,
        problem_statement: `[Analysis failed: ${errorMessage}] - Unable to analyze competitor. Please try again or enter details manually.`,
        solution: 'Manual entry required - competitor analysis unavailable',
        target_market: 'To be determined',
        competitor_reference: url
      },
      four_buckets_summary: {
        facts_count: 0,
        assumptions_count: 0,
        simulations_count: 0,
        unknowns_count: 1
      },
      quality: {
        confidence_score: 0,
        data_quality: 'failed',
        analysis_notes: `Real-time analysis failed: ${errorMessage}`
      },
      _fallback: true,
      _error: errorMessage
    });
  }
}));

// =============================================================================
// SD-ARCH-EHG-007: Client serving removed - EHG_Engineer is backend API only
// All UI is served by EHG unified frontend at port 8080
// =============================================================================

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
// SOVEREIGN PIPE v3.7.0: VENTURE-SCOPED ROUTES (/api/v2/)
// =============================================================================

/**
 * Venture-scoped strategic directives
 */
app.get('/api/v2/ventures/:venture_id/strategic-directives', requireVentureScope, asyncHandler(async (req, res) => {
  // Filter SDs by venture_id
  const ventureId = req.venture_id;
  const filteredSDs = dashboardState.strategicDirectives.filter(sd =>
    sd.venture_id === ventureId || sd.metadata?.venture_id === ventureId
  );

  res.json({
    venture_id: ventureId,
    count: filteredSDs.length,
    strategic_directives: filteredSDs
  });
}));

/**
 * Venture-scoped PRDs
 */
app.get('/api/v2/ventures/:venture_id/prds', requireVentureScope, asyncHandler(async (req, res) => {
  const ventureId = req.venture_id;
  const filteredPRDs = dashboardState.prds.filter(prd =>
    prd.venture_id === ventureId || prd.metadata?.venture_id === ventureId
  );

  res.json({
    venture_id: ventureId,
    count: filteredPRDs.length,
    prds: filteredPRDs
  });
}));

/**
 * Venture-scoped backlog
 */
app.get('/api/v2/ventures/:venture_id/backlog', requireVentureScope, asyncHandler(async (req, res) => {
  const ventureId = req.venture_id;

  // Get SDs for this venture
  const ventureSDs = dashboardState.strategicDirectives.filter(sd =>
    sd.venture_id === ventureId || sd.metadata?.venture_id === ventureId
  );

  // Get backlog items for those SDs
  const sdIds = ventureSDs.map(sd => sd.id);
  const { data: backlogItems, error } = await dbLoader.supabase
    .from('strategic_backlog_items')
    .select('*')
    .in('sd_id', sdIds);

  if (error) {
    return res.status(500).json({
      alert: 'Failed to load venture backlog',
      severity: 'MEDIUM',
      category: 'DATABASE'
    });
  }

  res.json({
    venture_id: ventureId,
    sd_count: ventureSDs.length,
    backlog_count: backlogItems?.length || 0,
    backlog_items: backlogItems || []
  });
}));

// =============================================================================
// SOVEREIGN PIPE v3.7.0: EVA ERROR HANDLER
// =============================================================================

// Create EVA Error Handler with Supabase for logging
const evaErrorHandler = createEvaErrorHandler({
  supabase: dbLoader?.supabase || null
});

// Register error handler (must be after all routes)
app.use(evaErrorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  await loadState();

  // Initialize STORY agent if enabled
  if (process.env.FEATURE_STORY_AGENT === 'true') {
    const storyBootstrap = new StoryAgentBootstrap();
    await storyBootstrap.initialize();
    console.log('🎯 STORY Agent initialized');
  }

  // Initialize RCA runtime monitoring (SD-RCA-001)
  // Auto-triggers for: Sub-agent failures, Test failures, Quality gates, Handoff rejections
  await bootstrapRCAMonitoring();
  registerRCAShutdownHandlers();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n=============================================================');
    console.log('🚀 EHG_Engineer Unified Application Server');
    console.log('=============================================================');
    console.log(`📍 Local:            http://localhost:${PORT}`);
    console.log(`📍 Network:          http://0.0.0.0:${PORT}`);
    console.log(`📊 Dashboard:        http://localhost:${PORT}/dashboard`);
    console.log('🎙️  EVA Voice:       http://localhost:8080/eva-assistant (EHG App) ✅');
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