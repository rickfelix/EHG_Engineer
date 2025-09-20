# Contributing to EHG Engineering - LEO Protocol

Welcome to the EHG Engineering project! This guide will help you set up your development environment and understand our contribution process.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Git Hooks Configuration](#git-hooks-configuration)
- [Database Setup](#database-setup)
- [LEO Protocol Compliance](#leo-protocol-compliance)
- [Running Tests](#running-tests)
- [Submitting Changes](#submitting-changes)

## Prerequisites

- Node.js 18+ and npm 8+
- PostgreSQL 14+ (or Supabase account)
- Git 2.30+
- Optional: Docker for local database

## Development Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/ehg-engineer.git
cd ehg-engineer

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Environment Variables

Edit `.env` with your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key  # For admin operations

# Database Direct Connection (optional)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# GitHub (for CI/CD)
GITHUB_TOKEN=your-github-token
```

## Git Hooks Configuration

### Enable Pre-commit Hooks

```bash
# Configure git to use our hooks directory
git config core.hooksPath .githooks

# Make hooks executable (Unix/Mac)
chmod +x .githooks/pre-commit
chmod +x .githooks/pre-commit.js

# For Windows users, use the Node.js version
# The .js version works on all platforms
```

### Windows-Specific Setup

If you're on Windows, the Node.js pre-commit hook will work automatically:

```bash
# Ensure Node is in your PATH
node --version

# The hook will run via Node.js
```

### Manual Hook Testing

```bash
# Test the pre-commit hook manually
node .githooks/pre-commit.js

# Test the drift checker
npx tsx tools/gates/drift-check.ts
```

## Database Setup

### Using Supabase (Recommended)

1. Create a Supabase project at https://supabase.com
2. Run migrations:

```bash
# Apply all migrations in order
npm run db:init
npm run db:migrate

# Apply LEO Protocol schema
psql $DATABASE_URL -f database/schema/013_leo_protocol_dashboard_schema.sql
psql $DATABASE_URL -f database/schema/013_leo_protocol_dashboard_fixes.sql
```

### Database Roles

The following PostgREST roles are used:

- `anon` - Anonymous access (read-only)
- `authenticated` - Logged-in users
- `service_role` - Admin/CI operations
- `dashboard_viewer` - Dashboard read access

To create the dashboard viewer role:

```sql
CREATE ROLE dashboard_viewer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_viewer;
```

### Supabase Auth Helpers

Our RLS policies use Supabase auth helpers:
- `auth.role()` - Returns the JWT role claim
- `auth.uid()` - Returns the authenticated user ID
- `auth.jwt()` - Returns the full JWT claims

For non-Supabase deployments, you'll need to implement equivalent functions.

## LEO Protocol Compliance

### Key Rules (v4.1.2)

1. **Database-First Architecture**
   - PRDs must be stored in database only (no `.md` files in `/prds/`)
   - Handoffs tracked in database tables
   - Gate reviews in `leo_gate_reviews` table

2. **Module Boundaries**
   - LEO Engineering (`/scripts/leo*`, `/lib/leo/`) cannot import from EHG App
   - EHG App (`/src/`, `/lib/venture/`) cannot import from LEO Engineering
   - Shared utilities (`/lib/utils/`) can be used by both

3. **Gate Requirements**
   - Gates 2A-2D must score ≥85% to pass
   - Gate weights must sum to exactly 1.000
   - All artifacts stored in database

### Running Compliance Checks

```bash
# Check for filesystem drift
npx tsx tools/gates/drift-check.ts

# Check module boundaries
npx eslint . --max-warnings 0

# Validate gate weights
psql $DATABASE_URL -c "SELECT * FROM v_gate_rule_integrity;"

# Test RLS permissions
psql $DATABASE_URL -c "SELECT * FROM test_rls_permissions();"
```

### Common Fixes

```bash
# Move PRDs to database
node scripts/add-prd-to-database.js --file prds/PRD-001.md
rm prds/*.md

# Fix module boundaries
npx eslint --fix .

# Update gate weights
psql $DATABASE_URL -c "UPDATE leo_validation_rules SET weight = 0.333 WHERE gate = '2A' AND rule_name = 'has_adrs';"
```

## Running Tests

### Unit Tests

```bash
npm test                 # Run all tests
npm run test:coverage    # With coverage report
npm run test:watch       # Watch mode
```

### Integration Tests

```bash
# Test sub-agents
npm run test:subagents

# Test dashboard
npm run dashboard:test

# Test database connections
npm run test-database
```

### CI Tests

These run automatically on PR:
- Filesystem drift check
- Module boundary validation
- Gate weight integrity
- RLS permission tests

## Submitting Changes

### 1. Create Feature Branch

```bash
git checkout -b feat/your-feature
# or
git checkout -b fix/your-fix
```

### 2. Make Changes

- Follow LEO Protocol guidelines
- Ensure all tests pass
- Update documentation as needed

### 3. Commit with Conventional Commits

```bash
git add .
git commit -m "feat: add new dashboard widget"
# Pre-commit hooks will run automatically
```

### 4. Push and Create PR

```bash
git push origin feat/your-feature
```

Then create a PR on GitHub. The CI will:
1. Run drift checks
2. Validate module boundaries
3. Check gate weights
4. Test RLS permissions

### PR Requirements

- [ ] All CI checks pass
- [ ] No filesystem drift detected
- [ ] Module boundaries respected
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Gate scoring ≥85% if applicable

## Getting Help

- **Documentation**: `/docs/` directory
- **LEO Protocol**: `CLAUDE.md`
- **Issues**: GitHub Issues
- **Discord**: [Join our server](https://discord.gg/example)

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License

By contributing, you agree that your contributions will be licensed under the project's license.

---

## Quick Reference

### Essential Commands

```bash
# Development
npm run dev              # Start dev server
npm run build:client     # Build React client
npm run dashboard        # Start dashboard

# Database
npm run db:init          # Initialize database
npm run db:migrate       # Run migrations
npm run check-db         # Verify connection

# LEO Protocol
npm run leo              # LEO CLI
npm run leo:status       # Check LEO status
npm run leo:sync         # Sync protocol

# Testing
npm test                 # Run tests
npx tsx tools/gates/drift-check.ts  # Check drift
npx eslint .             # Check boundaries

# Git Hooks
git config core.hooksPath .githooks  # Enable hooks
node .githooks/pre-commit.js         # Test hook
```

### Troubleshooting

**Pre-commit hook not running?**
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

**Database connection issues?**
```bash
npm run check-db
npm run test-database
```

**Module boundary violations?**
```bash
npx eslint . --fix
```

**Drift detected?**
```bash
node scripts/add-prd-to-database.js
rm prds/*.md
```

---

*Last updated: 2025-01-16*