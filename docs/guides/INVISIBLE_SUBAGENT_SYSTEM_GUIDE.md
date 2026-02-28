---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Invisible Sub-Agent System - Usage Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, unit

## 🎯 System Status: ACTIVATED

The invisible sub-agent system is now active and ready to use!

## 📋 System Components

### ✅ Active Components:
- **Context Monitor**: Analyzes prompts and project context
- **Auto-Selector**: Intelligently selects relevant sub-agents
- **Prompt Enhancer**: Seamlessly integrates insights into responses
- **Learning System**: Adapts based on usage patterns (database-dependent)
- **Performance Optimizer**: Caches and optimizes for speed

### 🔧 Configuration Status:
- Dependencies: ✅
- Environment: ✅  
- Database: ✅
- Components: ✅
- Integration: ✅

## 🚀 How to Use

### Automatic Operation (Recommended)
The system works **completely invisibly**. Just use Claude Code normally:

```bash
# No changes needed - system works in background
claude "Add authentication to my React app"
claude "Optimize database queries"
claude "Fix security vulnerabilities"
```

### Manual Testing
Test the system with specific scenarios:

```bash
# Run system tests
node scripts/test-system-simple.js

# Test specific components
node -e "
import('./lib/agents/context-monitor.js').then(m => {
  const monitor = new m.default(process.env.OPENAI_API_KEY);
  return monitor.analyzeContext('Add auth to React app', {});
}).then(console.log);
"
```

## ⚙️ Configuration

### Environment Variables (Required)
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_key  # Optional for AI features
```

### System Settings
- **Auto Threshold**: 0.8 (auto-execute above this confidence)
- **Prompt Threshold**: 0.6 (prompt user between 0.6-0.8)
- **Max Agents**: 3 (maximum agents selected per request)
- **Enhancement Style**: seamless (invisible integration)

## 🎨 Enhancement Modes

### 1. Seamless Mode (Default)
Insights are woven naturally into responses:
*Security consideration: Use HTTPS for authentication endpoints*

### 2. Sectioned Mode
Insights appear in dedicated sections:
## Additional Analysis
### Security Sub-Agent Analysis
🚨 **Critical**: Use HTTPS for authentication endpoints

### 3. Minimal Mode
Brief additional considerations:
*Additional considerations: Use HTTPS • Validate inputs • Hash passwords*

## 🤖 Available Sub-Agents

1. **Security** - Authentication, authorization, vulnerabilities
2. **Performance** - Optimization, caching, bottlenecks
3. **Design** - UI/UX, accessibility, responsive design
4. **Testing** - Unit tests, integration tests, coverage
5. **Database** - Schema, migrations, query optimization
6. **API** - REST design, GraphQL, rate limiting
7. **Cost** - Resource optimization, cloud costs
8. **Documentation** - API docs, code comments, guides
9. **Dependency** - Package management, security updates
10. **Debug** - Error analysis, troubleshooting, logging

## 🔧 Troubleshooting

### No Enhancements Appearing
1. Check if agents are being selected: Look for "Learning interaction" logs
2. Verify confidence thresholds: Agents may be below threshold
3. Check OpenAI API key: Falls back to rule-based without AI

### Performance Issues  
1. Enable Redis caching: Set REDIS_URL environment variable
2. Adjust confidence thresholds: Lower thresholds = more agents
3. Check response integrator timeout settings

### Database Issues
1. Verify Supabase connection: Check URL and keys
2. Create learning tables: Run database migration script
3. Check table permissions: Ensure RLS policies allow access

## 📊 Monitoring

### View System Statistics
```javascript
import ResponseIntegrator from './lib/agents/response-integrator.js';
const integrator = new ResponseIntegrator({...config});
const stats = integrator.getStatistics();
console.log(stats);
```

### Learning Data
Check interaction history and patterns in Supabase dashboard.

---

**Generated**: 2025-09-04T13:55:47.397Z
**Status**: System Active and Ready
**Mode**: AI-Powered
