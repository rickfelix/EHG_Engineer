---
category: api
status: draft
version: 1.0.0
author: Rick Felix
last_updated: 2026-02-28
tags: [api, auto-generated]
---
# EHG Engineer - LEO Protocol Development Environment



## Table of Contents

- [Metadata](#metadata)
- [📋 Overview](#-overview)
  - [🌟 Key Features](#-key-features)
- [🚀 Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [🏗️ Architecture](#-architecture)
  - [LEO Protocol Workflow](#leo-protocol-workflow)
  - [Sub-Agents](#sub-agents)
- [📚 Usage](#-usage)
  - [Creating a Strategic Directive](#creating-a-strategic-directive)
  - [Running Sub-Agent Analysis](#running-sub-agent-analysis)
  - [LEO Protocol Commands](#leo-protocol-commands)
- [🛠️ Development](#-development)
  - [Project Structure](#project-structure)
  - [Running Tests](#running-tests)
  - [Development Mode Features](#development-mode-features)
- [🔒 Security](#-security)
  - [Using the Log Sanitizer](#using-the-log-sanitizer)
- [📊 Dashboard](#-dashboard)
- [🤝 Contributing](#-contributing)
  - [Commit Message Format](#commit-message-format)
- [📝 API Documentation](#-api-documentation)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Events](#websocket-events)
- [🐛 Troubleshooting](#-troubleshooting)
  - [Common Issues](#common-issues)
- [📄 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)

## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

[![LEO Protocol](https://img.shields.io/badge/LEO%20Protocol-v4.1.2-blue)]()
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

## 📋 Overview

EHG Engineer is a sophisticated development environment implementing the **LEO Protocol** - a multi-agent workflow system for software development. It provides intelligent code analysis, automated testing, and comprehensive project management through specialized sub-agents.

### 🌟 Key Features

- **Multi-Agent Architecture**: Specialized agents for Security, Performance, Testing, Documentation, API analysis, and more
- **LEO Protocol Workflow**: Structured LEAD → PLAN → EXEC → VERIFY → APPROVE development cycle
- **Real-time Dashboard**: WebSocket-enabled dashboard for monitoring project progress
- **Intelligent Code Analysis**: Context-aware code analysis with framework detection
- **Database-First Approach**: All strategic directives and PRDs stored in Supabase

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn package manager
- Supabase account (for database features)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/ehg-engineer.git
   cd ehg-engineer
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

   Required environment variables:
   ```env
   # Supabase Configuration
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   
   # OpenAI Configuration (optional, for AI features)
   OPENAI_API_KEY=your-openai-key
   
   # Dashboard Configuration
   DASHBOARD_PORT=3456
   
   # Development Settings
   NODE_ENV=development
   LOG_REDACTION_LEVEL=partial  # full | partial | masked
   ```

4. **Initialize the database**
   ```bash
   npm run db:init
   ```

5. **Start the dashboard**
   ```bash
   npm run dashboard
   # Dashboard will be available at http://localhost:3456
   ```

## 🏗️ Architecture

### LEO Protocol Workflow

```
LEAD (20%) → PLAN (20%) → EXEC (30%) → VERIFY (15%) → APPROVE (15%)
     ↓           ↓           ↓            ↑            ↑
   Strategy   Design    Implement      Test        Deploy
```

### Sub-Agents

| Agent | Purpose | Activation Triggers |
|-------|---------|-------------------|
| **Security** | Vulnerability analysis, auth validation | Authentication, PII, encryption keywords |
| **Performance** | Memory leaks, optimization | Performance metrics, bundle size |
| **Testing** | Coverage analysis, test quality | Coverage >80%, E2E testing |
| **Documentation** | README validation, API docs | Documentation keywords |
| **API** | REST/GraphQL analysis | API endpoints, OpenAPI |
| **Database** | Query optimization, schema review | Schema changes, migrations |
| **Design** | UI/UX compliance, accessibility | 2+ UI requirements |
| **Cost** | Resource usage, optimization | Budget constraints |

## 📚 Usage

### Creating a Strategic Directive

```bash
node scripts/create-strategic-directive.js SD-2025-001
```

### Running Sub-Agent Analysis

```bash
# Test all sub-agents on current project
node test-subagents-on-ehg.js

# Run specific agent
node scripts/test-security-subagent.js
```

### LEO Protocol Commands

```bash
# Check current protocol version
node scripts/get-latest-leo-protocol-version.js

# Validate handoff checklist
node scripts/leo-checklist.js [agent-name]

# Monitor context usage
node scripts/context-monitor.js
```

## 🛠️ Development

### Project Structure

```
ehg-engineer/
├── lib/
│   ├── agents/          # Sub-agent implementations
│   ├── dashboard/       # Dashboard server and client
│   └── utils/           # Utility functions
├── scripts/             # Automation and management scripts
├── docs/                # Documentation
│   ├── strategic-directives/
│   ├── prds/
│   └── protocols/
├── templates/           # Handoff and communication templates
└── tests/               # Test suites
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test suite
npm test -- agents.test.js
```

### Development Mode Features

- **Safe Logging**: Automatic sensitive data redaction
- **Debug Mode**: `NODE_ENV=development` enables verbose logging
- **Hot Reload**: Dashboard automatically refreshes on file changes
- **Mock Data**: Test data generators for development

## 🔒 Security

This development environment includes security features:

- **Log Sanitization**: Automatic redaction of sensitive data (emails, tokens, passwords)
- **Input Validation**: Built-in validation for API endpoints
- **Environment Isolation**: Separate configs for dev/test/prod
- **Secure Defaults**: Security-first configuration

### Using the Log Sanitizer

```javascript
const { safeConsole } = require('./lib/utils/log-sanitizer');

// Automatically redacts sensitive data
safeConsole.log('User email:', user.email);  
// Output: User email: u***@***.com

// Development debug mode (only in dev environment)
safeConsole.debug('Full data:', sensitiveData);
```

## 📊 Dashboard

The real-time dashboard provides:

- Strategic Directive tracking
- PRD management and progress
- Sub-agent activity monitoring
- LEO Protocol workflow visualization
- WebSocket-based real-time updates

Access at: `http://localhost:3456`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes following LEO Protocol
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Commit Message Format

```
[AGENT] Short description

Detailed explanation of changes
- Bullet points for multiple changes
- Reference SD or PRD numbers

SD-YYYY-XXX | PRD-YYYY-XXX
```

## 📝 API Documentation

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sds` | GET | List all Strategic Directives |
| `/api/sds/:id` | GET | Get specific SD |
| `/api/prds` | GET | List all PRDs |
| `/api/prds/:id` | GET | Get specific PRD |
| `/api/agents/status` | GET | Get agent status |
| `/api/refresh` | POST | Trigger dashboard refresh |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `update` | Server→Client | Data update notification |
| `refresh` | Server→Client | Full refresh required |
| `subscribe` | Client→Server | Subscribe to updates |
| `unsubscribe` | Client→Server | Unsubscribe from updates |

## 🐛 Troubleshooting

### Common Issues

1. **Dashboard not loading**
   - Check if port 3456 is available
   - Verify Supabase credentials in `.env`

2. **Sub-agents failing**
   - Run `npm install` to ensure all dependencies are installed
   - Check Node.js version (requires >= 16.0.0)

3. **Database connection errors**
   - Verify Supabase URL and keys
   - Check network connectivity

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- LEO Protocol design and implementation
- Claude Code integration
- Supabase for database infrastructure
- All contributors and maintainers

---

*Built with the LEO Protocol v4.1.2 - Database-First Enforcement Update*