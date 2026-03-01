---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Windows Development Setup Guide



## Table of Contents

- [Metadata](#metadata)
- [Prerequisites](#prerequisites)
  - [Required Software](#required-software)
  - [Verify Installation](#verify-installation)
- [Repository Setup](#repository-setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Environment Configuration](#3-environment-configuration)
- [Starting Development Servers](#starting-development-servers)
  - [Using PowerShell Scripts (Recommended)](#using-powershell-scripts-recommended)
  - [Using npm Scripts](#using-npm-scripts)
- [Running Tests](#running-tests)
  - [Unit Tests](#unit-tests)
  - [Smoke Tests](#smoke-tests)
  - [E2E Tests (Playwright)](#e2e-tests-playwright)
  - [UAT Tests](#uat-tests)
- [Database Operations](#database-operations)
  - [Connect to Database](#connect-to-database)
  - [Test Database Connection](#test-database-connection)
- [Compliance & Auditing](#compliance-auditing)
  - [Run LEO Compliance Audit](#run-leo-compliance-audit)
- [Troubleshooting](#troubleshooting)
  - [PowerShell Execution Policy](#powershell-execution-policy)
  - [Port Already in Use](#port-already-in-use)
  - [Node.js Memory Issues](#nodejs-memory-issues)
  - [Git Line Ending Issues](#git-line-ending-issues)
  - [Python Virtual Environment (Agent Platform)](#python-virtual-environment-agent-platform)
- [Directory Structure](#directory-structure)
- [Cross-Platform Compatibility](#cross-platform-compatibility)
- [Additional Resources](#additional-resources)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-02-23
- **Tags**: database, api, e2e, unit

This guide covers setting up EHG_Engineer for native Windows development without WSL.

## Prerequisites

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | LTS (20.x or later) | [nodejs.org](https://nodejs.org/) |
| **Git for Windows** | Latest | [git-scm.com](https://git-scm.com/download/win) |
| **PowerShell** | 7.x (recommended) | [Microsoft Store](https://aka.ms/powershell) or included with Windows |
| **Python** | 3.10+ (for agent-platform) | [python.org](https://www.python.org/downloads/) |

### Verify Installation

Open PowerShell and run:

```powershell
node --version      # Should show v20.x.x or later
npm --version       # Should show 10.x.x or later
git --version       # Should show git version 2.x.x
python --version    # Should show Python 3.10+
```

## Repository Setup

### 1. Clone the Repository

```powershell
# Navigate to your projects folder
cd C:\Users\<username>\Projects

# Clone EHG_Engineer
git clone https://github.com/rickfelix/EHG_Engineer.git
cd EHG_Engineer
```

### 2. Install Dependencies

```powershell
npm install
```

### 3. Environment Configuration

Copy the example environment file and configure:

```powershell
# Copy environment template (if exists)
Copy-Item .env.example .env

# Or create .env with required variables
```

**Required Environment Variables:**

```env
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Gemini (primary LLM — required for all AI features)
# Get your key: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-gemini-api-key

# OpenAI (optional — fallback LLM and voice/WebRTC only)
OPENAI_API_KEY=your-openai-key
```

> **Note**: As of 2026-02-23, Google Gemini 3.x is the default LLM provider.
> `GEMINI_API_KEY` is sufficient for all non-voice features.
> `OPENAI_API_KEY` is only required for voice/WebRTC (`supabase/functions/openai-realtime-token`).

## Starting Development Servers

### Using PowerShell Scripts (Recommended)

EHG_Engineer includes PowerShell scripts for Windows-native server management.

**Start All Servers:**

```powershell
.\scripts\leo-stack.ps1 start
```

**Individual Server Commands:**

```powershell
# Start LEO Stack (Engineer + App + Agent Platform)
.\scripts\leo-stack.ps1 start

# Restart all servers
.\scripts\leo-stack.ps1 restart

# Stop all servers
.\scripts\leo-stack.ps1 stop

# Check server status
.\scripts\leo-stack.ps1 status
```

**Quick Start Individual Apps:**

```powershell
# Start EHG Engineer Dashboard only (port 3000)
.\scripts\start-ehg-engineer.ps1

# Start EHG Main App only (port 8080)
.\scripts\start-ehg-main.ps1

# Start all EHG applications
.\scripts\start-all-ehg.ps1
```

### Using npm Scripts

npm scripts are cross-platform and work on Windows:

```powershell
# Run LEO Protocol workflow
npm run leo

# Check SD queue
npm run sd:next

# Run smoke tests
npm run test:smoke
```

## Running Tests

### Unit Tests

```powershell
npm run test:unit
```

### Smoke Tests

```powershell
npm run test:smoke
```

### E2E Tests (Playwright)

```powershell
# Run all E2E tests
npm run test:e2e

# Run human-like E2E tests (uses cross-platform runner)
npm run test:e2e:human

# Run accessibility tests
npm run test:e2e:a11y
```

### UAT Tests

```powershell
npm run test:uat
```

## Database Operations

### Connect to Database

```powershell
.\scripts\db-connect.ps1
```

### Test Database Connection

```powershell
.\scripts\db-test.ps1
```

## Compliance & Auditing

### Run LEO Compliance Audit

```powershell
npm run audit-compliance
```

This uses the cross-platform runner which automatically selects:
- `leo_compliance_audit.ps1` on Windows
- `leo_compliance_audit.sh` on Linux/WSL

## Troubleshooting

### PowerShell Execution Policy

If you get "running scripts is disabled" error:

```powershell
# Check current policy
Get-ExecutionPolicy

# Set to allow local scripts (run as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Port Already in Use

If a port is already in use:

```powershell
# Find process using port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Get-Process -Id <process-id>

# Or use the LEO stack script which handles this automatically
.\scripts\leo-stack.ps1 restart
```

### Node.js Memory Issues

If you encounter memory errors:

```powershell
# Set NODE_OPTIONS (temporary)
$env:NODE_OPTIONS="--max-old-space-size=4096"

# Or use cross-env in npm scripts (already configured)
npm run <script>
```

### Git Line Ending Issues

If you see CRLF warnings:

```powershell
# Configure Git for Windows line endings
git config --global core.autocrlf true
```

### Python Virtual Environment (Agent Platform)

For the agent-platform component:

```powershell
cd agent-platform
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Directory Structure

```
C:\Users\rickf\Projects\_EHG\
├── EHG_Engineer\          # This project (LEO Protocol development)
│   ├── scripts\           # PowerShell & Bash scripts
│   ├── docs\              # Documentation
│   └── ...
└── ehg\                   # Main EHG application
    ├── src\
    └── ...
```

## Cross-Platform Compatibility

EHG_Engineer uses a cross-platform script runner (`scripts/cross-platform-run.js`) that automatically:

- Detects the operating system
- Uses `.ps1` (PowerShell) scripts on Windows when available
- Falls back to Git Bash for `.sh` scripts when no `.ps1` exists
- Uses bash on Linux/macOS/WSL

**Available PowerShell Scripts:**

| Script | Purpose |
|--------|---------|
| `leo-stack.ps1` | Full LEO Stack management |
| `start-all-ehg.ps1` | Start all EHG applications |
| `start-ehg-engineer.ps1` | Start Engineer dashboard |
| `start-ehg-main.ps1` | Start main EHG app |
| `run-human-like-tests.ps1` | E2E test runner |
| `db-connect.ps1` | Database connection |
| `db-test.ps1` | Database connectivity tests |
| `leo_compliance_audit.ps1` | LEO compliance audit |

## Additional Resources

- LEO Protocol Documentation
- [Database Schema Reference](../reference/schema/)
- [Contributing Guide](../../CONTRIBUTING.md)

---

*Part of SD-WIN-MIG-004-DOCS: Windows Development Documentation*
*Last updated: 2026-01-13*
