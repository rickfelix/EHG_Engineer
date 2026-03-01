/**
 * Context Monitoring Engine
 * Automatically analyzes user context to intelligently select relevant sub-agents
 * Works invisibly in the background without manual intervention
 */

import { getLLMClient } from '../llm/client-factory.js';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { TTLMap } from '../utils/ttl-map.js';

class ContextMonitor {
  constructor(openaiApiKey, projectRoot = process.cwd()) {
    this.openai = getLLMClient({ purpose: 'validation' });
    this.projectRoot = projectRoot;
    this.contextCache = new TTLMap({ defaultTTLMs: 5 * 60 * 1000, maxEntries: 500 }); // 5 min TTL
    this.userPatterns = new TTLMap({ defaultTTLMs: 60 * 60 * 1000, maxEntries: 200 }); // 60 min TTL
    
    // Configuration with sensible defaults
    this.config = {
      enabled: true,
      confidence_threshold: 0.7,
      max_agents: 3,
      learning_mode: true,
      context_sources: ['files', 'git', 'errors', 'project_structure'],
      cache_ttl: 300000, // 5 minutes
      analysis_timeout: 3000 // 3 seconds max
    };
    
    // Sub-agent definitions with trigger patterns
    this.subAgents = {
      SECURITY: {
        name: 'Security Sub-Agent',
        priority: 90,
        file_patterns: [/auth/, /login/, /password/, /security/, /jwt/, /oauth/, /session/],
        content_patterns: ['authentication', 'authorization', 'security', 'vulnerability', 'encrypt', 'decrypt', 'hash', 'token'],
        error_patterns: ['unauthorized', 'forbidden', 'authentication failed', 'invalid token']
      },
      PERFORMANCE: {
        name: 'Performance Sub-Agent', 
        priority: 80,
        file_patterns: [/performance/, /optimization/, /cache/, /query/, /slow/],
        content_patterns: ['slow', 'performance', 'optimization', 'cache', 'latency', 'bottleneck', 'speed'],
        error_patterns: ['timeout', 'slow query', 'high cpu', 'memory leak', 'performance']
      },
      DESIGN: {
        name: 'Design Sub-Agent',
        priority: 70,
        file_patterns: [/component/, /\.tsx$/, /\.vue$/, /\.jsx$/, /styles/, /css/, /ui/],
        content_patterns: ['ui', 'ux', 'design', 'component', 'responsive', 'accessibility', 'layout'],
        error_patterns: ['layout shift', 'accessibility', 'responsive', 'css error']
      },
      TESTING: {
        name: 'Testing Sub-Agent',
        priority: 85,
        file_patterns: [/test/, /spec/, /\.test\./, /\.spec\./, /cypress/, /playwright/],
        content_patterns: ['test', 'testing', 'coverage', 'e2e', 'unit test', 'integration', 'qa'],
        error_patterns: ['test failed', 'assertion error', 'test timeout', 'coverage']
      },
      DATABASE: {
        name: 'Database Sub-Agent',
        priority: 85,
        file_patterns: [/schema/, /migration/, /sql/, /db/, /database/, /model/],
        content_patterns: ['database', 'schema', 'migration', 'query', 'sql', 'table', 'index'],
        error_patterns: ['database error', 'connection refused', 'migration failed', 'sql error']
      },
      API: {
        name: 'API Sub-Agent',
        priority: 75,
        file_patterns: [/api/, /endpoint/, /route/, /controller/, /service/],
        content_patterns: ['api', 'endpoint', 'rest', 'graphql', 'webhook', 'integration'],
        error_patterns: ['api error', '404', '500', 'connection refused', 'timeout']
      },
      COST: {
        name: 'Cost Optimization Sub-Agent',
        priority: 60,
        file_patterns: [/docker/, /config/, /infrastructure/, /deploy/],
        content_patterns: ['cost', 'optimization', 'resources', 'infrastructure', 'scaling', 'cloud'],
        error_patterns: ['resource exhausted', 'quota exceeded', 'billing']
      },
      DOCS: {
        name: 'Documentation Sub-Agent',
        priority: 65,
        file_patterns: [/readme/, /doc/, /\.md$/, /comment/, /jsdoc/],
        content_patterns: ['documentation', 'readme', 'guide', 'comments', 'explain'],
        error_patterns: ['missing documentation', 'undocumented']
      },
      DEPENDENCY: {
        name: 'Dependency Sub-Agent',
        priority: 70,
        file_patterns: [/package\.json/, /yarn\.lock/, /Cargo\.toml/, /requirements\.txt/],
        content_patterns: ['dependency', 'package', 'version', 'update', 'upgrade', 'install'],
        error_patterns: ['dependency error', 'module not found', 'version conflict']
      },
      DEBUG: {
        name: 'Debugging Sub-Agent',
        priority: 80,
        file_patterns: [/error/, /bug/, /issue/, /debug/],
        content_patterns: ['bug', 'error', 'issue', 'debug', 'troubleshoot', 'fix', 'problem'],
        error_patterns: ['error', 'exception', 'crash', 'failure', 'bug']
      }
    };
  }

  /**
   * Main entry point - analyze context and return relevant sub-agents
   * @param {string} userPrompt - The user's input
   * @param {object} context - Additional context (files, git, etc.)
   * @returns {Promise<object>} Agent selection results
   */
  async analyzeContext(userPrompt, context = {}) {
    if (!this.config.enabled) {
      return { selected_agents: [], reasoning: 'Context monitoring disabled' };
    }

    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(userPrompt, context);
      
      // Check cache first
      if (this.contextCache.has(cacheKey)) {
        const cached = this.contextCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cache_ttl) {
          return cached.result;
        }
      }

      // Gather comprehensive context
      const enrichedContext = await this.gatherContext(userPrompt, context);
      
      // Analyze with OpenAI if available, fallback to rule-based
      const analysis = this.openai ? 
        await this.analyzeWithAI(userPrompt, enrichedContext) :
        await this.analyzeWithRules(userPrompt, enrichedContext);
      
      // Cache the result
      this.contextCache.set(cacheKey, {
        result: analysis,
        timestamp: Date.now()
      });
      
      // Learn from this interaction (if learning enabled)
      if (this.config.learning_mode) {
        this.recordInteraction(userPrompt, enrichedContext, analysis);
      }
      
      return analysis;
    } catch (error) {
      console.error('Context analysis failed:', error);
      return {
        selected_agents: [],
        reasoning: 'Analysis failed: ' + error.message,
        error: true
      };
    }
  }

  /**
   * Gather comprehensive context from multiple sources
   */
  async gatherContext(userPrompt, providedContext) {
    const context = {
      user_prompt: userPrompt,
      timestamp: new Date().toISOString(),
      ...providedContext
    };

    try {
      // Gather file context
      if (this.config.context_sources.includes('files')) {
        context.file_context = await this.gatherFileContext();
      }

      // Gather git context  
      if (this.config.context_sources.includes('git')) {
        context.git_context = await this.gatherGitContext();
      }

      // Gather project structure context
      if (this.config.context_sources.includes('project_structure')) {
        context.project_context = await this.gatherProjectContext();
      }

      // Gather error context (from logs, recent failures)
      if (this.config.context_sources.includes('errors')) {
        context.error_context = await this.gatherErrorContext();
      }

      return context;
    } catch (error) {
      console.error('Context gathering failed:', error);
      return context; // Return partial context
    }
  }

  /**
   * AI-powered context analysis using OpenAI
   */
  async analyzeWithAI(userPrompt, context) {
    const systemPrompt = this.buildAISystemPrompt();
    const contextPrompt = this.buildContextPrompt(userPrompt, context);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt }
        ],
        functions: [{
          name: 'select_subagents',
          description: 'Select relevant sub-agents based on context analysis',
          parameters: {
            type: 'object',
            properties: {
              selected_agents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    agent_code: {
                      type: 'string',
                      enum: Object.keys(this.subAgents)
                    },
                    confidence: {
                      type: 'number',
                      minimum: 0,
                      maximum: 1
                    },
                    reasoning: {
                      type: 'string'
                    },
                    priority: {
                      type: 'string',
                      enum: ['primary', 'secondary', 'supporting']
                    }
                  },
                  required: ['agent_code', 'confidence', 'reasoning', 'priority']
                }
              },
              coordination_strategy: {
                type: 'string',
                enum: ['sequential', 'parallel', 'hybrid']
              },
              analysis_summary: {
                type: 'string'
              }
            },
            required: ['selected_agents', 'coordination_strategy', 'analysis_summary']
          }
        }],
        function_call: { name: 'select_subagents' },
        temperature: 0.3
      });

      if (response.choices[0].function_call) {
        const result = JSON.parse(response.choices[0].function_call.arguments);
        
        // Filter by confidence threshold
        result.selected_agents = result.selected_agents.filter(
          agent => agent.confidence >= this.config.confidence_threshold
        );
        
        // Limit number of agents
        result.selected_agents = result.selected_agents
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, this.config.max_agents);
        
        return result;
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      // Fallback to rule-based analysis
      return await this.analyzeWithRules(userPrompt, context);
    }
  }

  /**
   * Rule-based context analysis (fallback when AI unavailable)
   */
  async analyzeWithRules(userPrompt, context) {
    const scores = new Map();
    const promptLower = userPrompt.toLowerCase();
    
    // Score each sub-agent
    for (const [code, agent] of Object.entries(this.subAgents)) {
      let score = 0;
      const reasons = [];
      
      // Content pattern matching
      for (const pattern of agent.content_patterns) {
        if (promptLower.includes(pattern.toLowerCase())) {
          score += 0.3;
          reasons.push(`Content contains "${pattern}"`);
        }
      }
      
      // File pattern matching
      if (context.file_context?.current_files) {
        for (const file of context.file_context.current_files) {
          for (const pattern of agent.file_patterns) {
            if (pattern.test(file)) {
              score += 0.4;
              reasons.push(`Working with ${file}`);
              break;
            }
          }
        }
      }
      
      // Error pattern matching
      if (context.error_context?.recent_errors) {
        for (const error of context.error_context.recent_errors) {
          for (const pattern of agent.error_patterns) {
            if (error.toLowerCase().includes(pattern)) {
              score += 0.5;
              reasons.push(`Recent error: ${pattern}`);
            }
          }
        }
      }
      
      // Git context influence
      if (context.git_context?.recent_changes) {
        for (const change of context.git_context.recent_changes) {
          for (const pattern of agent.file_patterns) {
            if (pattern.test(change.file)) {
              score += 0.2;
              reasons.push(`Recent changes in ${change.file}`);
            }
          }
        }
      }
      
      if (score > 0) {
        scores.set(code, {
          score,
          reasons,
          agent: agent.name
        });
      }
    }
    
    // Convert to result format
    const selected_agents = Array.from(scores.entries())
      .filter(([_code, data]) => data.score >= this.config.confidence_threshold)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, this.config.max_agents)
      .map(([code, data]) => ({
        agent_code: code,
        confidence: Math.min(data.score, 1.0),
        reasoning: data.reasons.join('; '),
        priority: data.score > 0.8 ? 'primary' : data.score > 0.5 ? 'secondary' : 'supporting'
      }));
    
    return {
      selected_agents,
      coordination_strategy: selected_agents.length > 2 ? 'hybrid' : 'parallel',
      analysis_summary: `Rule-based analysis selected ${selected_agents.length} agents based on content and context patterns`,
      method: 'rule_based'
    };
  }

  /**
   * File context gathering
   */
  async gatherFileContext() {
    try {
      const context = {
        current_files: [],
        recent_files: [],
        project_type: 'unknown'
      };
      
      // Detect current working files (this would need IDE integration)
      // For now, detect project type from key files
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      if (await this.fileExists(packageJsonPath)) {
        context.project_type = 'nodejs';
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        context.dependencies = Object.keys(packageJson.dependencies || {});
        context.current_files.push('package.json');
      }
      
      return context;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Git context gathering
   */
  async gatherGitContext() {
    try {
      const context = {
        current_branch: '',
        recent_commits: [],
        recent_changes: [],
        uncommitted_changes: false
      };
      
      // Get current branch
      try {
        context.current_branch = execSync('git branch --show-current', { 
          cwd: this.projectRoot, 
          encoding: 'utf8' 
        }).trim();
      } catch {}

      // Get recent commits
      try {
        const commits = execSync('git log --oneline -5', { 
          cwd: this.projectRoot, 
          encoding: 'utf8' 
        }).trim().split('\n');
        context.recent_commits = commits.map(line => {
          const [hash, ...message] = line.split(' ');
          return { hash, message: message.join(' ') };
        });
      } catch {}

      // Get recent file changes
      try {
        const changes = execSync('git diff --name-only HEAD~5..HEAD', { 
          cwd: this.projectRoot, 
          encoding: 'utf8' 
        }).trim().split('\n').filter(f => f);
        context.recent_changes = changes.map(file => ({ file, type: 'modified' }));
      } catch {}
      
      return context;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Project context gathering
   */
  async gatherProjectContext() {
    try {
      const context = {
        framework: 'unknown',
        languages: [],
        key_directories: []
      };
      
      // Detect framework/technology
      const indicators = [
        { file: 'package.json', framework: 'nodejs' },
        { file: 'Cargo.toml', framework: 'rust' },
        { file: 'requirements.txt', framework: 'python' },
        { file: 'pom.xml', framework: 'java' },
        { file: 'next.config.js', framework: 'nextjs' },
        { file: 'vite.config.js', framework: 'vite' }
      ];
      
      for (const { file, framework } of indicators) {
        if (await this.fileExists(path.join(this.projectRoot, file))) {
          context.framework = framework;
          break;
        }
      }
      
      return context;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Error context gathering
   */
  async gatherErrorContext() {
    try {
      // This would integrate with logging systems, build tools, etc.
      // For now, return placeholder
      return {
        recent_errors: [],
        build_status: 'unknown',
        test_status: 'unknown'
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Build AI system prompt
   */
  buildAISystemPrompt() {
    const agentDescriptions = Object.entries(this.subAgents)
      .map(([code, agent]) => `${code}: ${agent.name} (Priority: ${agent.priority})`)
      .join('\n');
    
    return `You are an intelligent sub-agent selector for a software development environment. Your job is to analyze user requests and context to select the most relevant sub-agents.

Available Sub-Agents:
${agentDescriptions}

Selection Criteria:
- Only select agents with confidence >= ${this.config.confidence_threshold}
- Maximum ${this.config.max_agents} agents per response
- Consider file context, git history, error patterns, and content analysis
- Prioritize based on relevance and potential impact
- Prefer fewer, highly relevant agents over many low-confidence ones

Always provide clear reasoning for each selection and suggest coordination strategy.`;
  }

  /**
   * Build context prompt for AI
   */
  buildContextPrompt(userPrompt, context) {
    return `Analyze this user request and context to select relevant sub-agents:

User Request: "${userPrompt}"

Context:
${JSON.stringify(context, null, 2)}

Select the most relevant sub-agents with confidence scores and reasoning.`;
  }

  /**
   * Utility methods
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  generateCacheKey(prompt, context) {
    // Create a simple hash of the prompt and key context elements
    const keyData = JSON.stringify({
      prompt,
      files: context.file_context?.current_files || [],
      git_branch: context.git_context?.current_branch || '',
      errors: context.error_context?.recent_errors || []
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
      const char = keyData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  recordInteraction(prompt, context, analysis) {
    // Record interaction for learning (would integrate with database)
    const interaction = {
      prompt,
      context_summary: this.summarizeContext(context),
      selected_agents: analysis.selected_agents,
      timestamp: new Date().toISOString()
    };
    
    // For now, just log it (in production, would save to database)
    console.log('Learning interaction:', interaction);
  }

  summarizeContext(context) {
    return {
      project_type: context.project_context?.framework || 'unknown',
      file_count: context.file_context?.current_files?.length || 0,
      has_git: !!context.git_context?.current_branch,
      has_errors: (context.error_context?.recent_errors?.length || 0) > 0
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

export default ContextMonitor;