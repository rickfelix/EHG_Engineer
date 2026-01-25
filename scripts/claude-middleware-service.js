#!/usr/bin/env node

/**
 * Claude Middleware Service
 * Runs the invisible sub-agent system as a background service
 * Intercepts and enhances Claude Code interactions automatically
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// ES Module setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Import the invisible sub-agent system components
import ContextMonitor from '../lib/agents/context-monitor.js';
import IntelligentAutoSelector from '../lib/agents/auto-selector.js';
import PromptEnhancer from '../lib/agents/prompt-enhancer.js';
import LearningSystem from '../lib/agents/learning-system.js';
import ResponseIntegrator from '../lib/agents/response-integrator.js';
import PerformanceOptimizer from '../lib/agents/performance-optimizer.js';

// Configuration
const PORT = process.env.SUBAGENT_PORT || 3457;
const PROJECT_ROOT = path.dirname(__dirname);

// Create Express app and WebSocket server
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize the invisible sub-agent system
class InvisibleSubAgentService {
  constructor() {
    this.contextMonitor = null;
    this.autoSelector = null;
    this.promptEnhancer = null;
    this.learningSystem = null;
    this.responseIntegrator = null;
    this.performanceOptimizer = null;
    
    this.pendingAnalysis = new Map(); // Store analysis results temporarily
    this.wsClients = new Set();
    
    this.initialize();
  }
  
  async initialize() {
    try {
      console.log('🚀 Initializing Invisible Sub-Agent System...');
      
      // Initialize components
      const openaiApiKey = process.env.OPENAI_API_KEY;
      
      this.contextMonitor = new ContextMonitor(openaiApiKey, PROJECT_ROOT);
      this.autoSelector = new IntelligentAutoSelector(openaiApiKey, PROJECT_ROOT);
      this.promptEnhancer = new PromptEnhancer(openaiApiKey, PROJECT_ROOT);
      
      this.learningSystem = new LearningSystem(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
      
      this.responseIntegrator = new ResponseIntegrator({
        openaiApiKey,
        projectRoot: PROJECT_ROOT,
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_ANON_KEY,
        enableLearning: true,
        enableCaching: true
      });
      
      this.performanceOptimizer = new PerformanceOptimizer({
        redis_url: process.env.REDIS_URL
      });
      
      // Initialize learning system
      await this.learningSystem.initialize();
      await this.responseIntegrator.initialize();
      
      console.log('✅ All sub-agent components initialized');
      console.log(`📊 Mode: ${openaiApiKey ? 'AI-Powered' : 'Rule-Based'}`);
      
      return true;
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      return false;
    }
  }
  
  /**
   * Analyze a user prompt and select relevant sub-agents
   */
  async analyzePrompt(prompt, context = {}) {
    try {
      const requestId = Date.now().toString();
      
      console.log(`\n🔍 Analyzing prompt (${requestId}): "${prompt.substring(0, 50)}..."`);
      
      // Get current project context
      const enrichedContext = {
        ...context,
        timestamp: new Date().toISOString(),
        project_root: PROJECT_ROOT,
        project_type: 'nodejs' // Can be detected dynamically
      };
      
      // Run analysis through the auto-selector
      const analysis = await this.autoSelector.processUserInput(prompt, enrichedContext);
      
      // Store analysis for later enhancement
      this.pendingAnalysis.set(requestId, {
        prompt,
        analysis,
        context: enrichedContext,
        timestamp: Date.now()
      });
      
      // Clean up old analyses (older than 5 minutes)
      const fiveMinutesAgo = Date.now() - 300000;
      for (const [id, data] of this.pendingAnalysis.entries()) {
        if (data.timestamp < fiveMinutesAgo) {
          this.pendingAnalysis.delete(id);
        }
      }
      
      // Log results
      if (analysis.selected_agents && analysis.selected_agents.length > 0) {
        console.log(`✅ Selected ${analysis.selected_agents.length} sub-agents:`);
        analysis.selected_agents.forEach(agent => {
          console.log(`   - ${agent.agent_name} (${(agent.confidence * 100).toFixed(0)}% confidence)`);
        });
      } else {
        console.log('ℹ️ No sub-agents selected for this prompt');
      }
      
      // Broadcast to WebSocket clients
      this.broadcast({
        type: 'analysis',
        requestId,
        prompt: prompt.substring(0, 100),
        agents: analysis.selected_agents || [],
        timestamp: new Date().toISOString()
      });
      
      return {
        requestId,
        analysis,
        selected: analysis.selected_agents || []
      };
      
    } catch (error) {
      console.error('❌ Prompt analysis failed:', error);
      return {
        requestId: Date.now().toString(),
        error: error.message,
        selected: []
      };
    }
  }
  
  /**
   * Enhance a Claude response with sub-agent insights
   */
  async enhanceResponse(requestId, claudeResponse) {
    try {
      console.log(`\n✨ Enhancing response for request ${requestId}`);
      
      // Get the stored analysis
      const stored = this.pendingAnalysis.get(requestId);
      if (!stored) {
        console.log('⚠️ No analysis found for this request');
        return claudeResponse;
      }
      
      // Use the prompt enhancer to integrate insights
      const enhanced = await this.promptEnhancer.enhanceResponse(
        stored.prompt,
        claudeResponse,
        stored.context
      );
      
      // Learn from this interaction
      if (this.learningSystem) {
        await this.learningSystem.recordInteraction(
          stored.prompt,
          stored.analysis,
          stored.context
        );
      }
      
      // Log enhancement
      if (enhanced.length > claudeResponse.length) {
        const added = enhanced.length - claudeResponse.length;
        console.log(`✅ Enhanced response (+${added} characters)`);
      } else {
        console.log('ℹ️ No enhancements added');
      }
      
      // Clean up stored analysis
      this.pendingAnalysis.delete(requestId);
      
      return enhanced;
      
    } catch (error) {
      console.error('❌ Response enhancement failed:', error);
      return claudeResponse;
    }
  }
  
  /**
   * Broadcast updates to WebSocket clients
   */
  broadcast(data) {
    const message = JSON.stringify(data);
    this.wsClients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    });
  }
  
  /**
   * Get system statistics
   */
  getStatistics() {
    return {
      pending_analyses: this.pendingAnalysis.size,
      ws_clients: this.wsClients.size,
      mode: process.env.OPENAI_API_KEY ? 'ai_powered' : 'rule_based',
      components: {
        context_monitor: this.contextMonitor ? 'ready' : 'not_initialized',
        auto_selector: this.autoSelector ? 'ready' : 'not_initialized',
        prompt_enhancer: this.promptEnhancer ? 'ready' : 'not_initialized',
        learning_system: this.learningSystem ? 'ready' : 'not_initialized',
        response_integrator: this.responseIntegrator ? 'ready' : 'not_initialized'
      }
    };
  }
}

// Create service instance
const service = new InvisibleSubAgentService();

// REST API Endpoints

// Health check
app.get('/health', (req, res) => {
  const stats = service.getStatistics();
  res.json({
    status: 'running',
    uptime: process.uptime(),
    ...stats
  });
});

// Analyze prompt endpoint
app.post('/analyze', async (req, res) => {
  const { prompt, context } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  
  const result = await service.analyzePrompt(prompt, context);
  res.json(result);
});

// Enhance response endpoint
app.post('/enhance', async (req, res) => {
  const { requestId, response } = req.body;
  
  if (!requestId || !response) {
    return res.status(400).json({ error: 'RequestId and response are required' });
  }
  
  const enhanced = await service.enhanceResponse(requestId, response);
  res.json({ enhanced });
});

// Get statistics
app.get('/stats', (req, res) => {
  res.json(service.getStatistics());
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket connection');
  service.wsClients.add(ws);
  
  // Send initial status
  ws.send(JSON.stringify({
    type: 'connected',
    stats: service.getStatistics()
  }));
  
  ws.on('close', () => {
    service.wsClients.delete(ws);
    console.log('🔌 WebSocket disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   🤖 Invisible Sub-Agent System Middleware           ║
║   Running on http://localhost:${PORT}                ║
║   WebSocket: ws://localhost:${PORT}                  ║
║                                                       ║
║   Status: ACTIVE                                      ║
║   Mode: ${process.env.OPENAI_API_KEY ? 'AI-Powered' : 'Rule-Based'.padEnd(45)}║
╚═══════════════════════════════════════════════════════╝
  `);
  
  console.log('📊 Available endpoints:');
  console.log('   GET  /health   - Health check');
  console.log('   POST /analyze  - Analyze prompt');
  console.log('   POST /enhance  - Enhance response');
  console.log('   GET  /stats    - Get statistics');
  console.log('   WS   /         - WebSocket connection');
  console.log('\nWaiting for Claude Code interactions...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️ Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default service;