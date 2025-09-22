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
      
      if (msg.type === 'updateSDStatus') {
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
// CLIENT SERVING
// =============================================================================

// Serve the React app for all other routes
app.get('*', (req, res) => {
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
}

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