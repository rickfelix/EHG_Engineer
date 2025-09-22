# EHG Staging Environment - One-Pager Runbook

## Quick Start

```bash
# 1. Navigate to staging directory
cd /mnt/c/_EHG/EHG_Engineer/ops/stage

# 2. Make bootstrap script executable
chmod +x bootstrap.sh

# 3. Launch staging database
docker-compose up -d

# 4. Wait for health check (30-60 seconds)
docker-compose ps

# 5. Verify connection
PGPASSWORD=cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG psql -h 127.0.0.1 -p 5434 -U codex_staging -d ehg_stage -c "SELECT version();"
```

## Architecture

- **Database**: PostgreSQL 16 on port 5434
- **Container**: `ehg_staging_db`
- **Volume**: `ehg_staging_data` (persistent between restarts)
- **Network**: `ehg_staging_network` (isolated)

## Users & Roles

| User | Password | Permissions | Expires |
|------|----------|-------------|---------|
| ehg_admin | stg_2025_09_22_7hN9kL4mP8vQ3xR6 | Superuser | Never |
| eng_service | eng_stg_2025 | Write eng_* tables | Never |
| vh_service | vh_stg_2025 | Write vh_* tables | Never |
| analyst_ro | analyst_stg_2025 | Read-only via views | Never |
| codex_staging | cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG | Limited housekeeping | 8 hours |

## Codex Permissions

**Allowed**:
- SELECT, INSERT, UPDATE on eng_* tables (governance)
- SELECT on vh_* tables (verification)
- INSERT, UPDATE on vh_* linkage targets (hydration only)
- SELECT on all views
- INSERT into audit.change_log

**Denied**:
- All DDL operations (CREATE, ALTER, DROP)
- DELETE on any table
- Access to pg_* system catalogs
- Database configuration changes

## Management Commands

```bash
# Start staging
docker-compose up -d

# View logs
docker-compose logs -f postgres_staging

# Stop staging
docker-compose down

# Destroy all data (full reset)
docker-compose down -v

# Connect as admin
PGPASSWORD=stg_2025_09_22_7hN9kL4mP8vQ3xR6 psql -h 127.0.0.1 -p 5434 -U ehg_admin -d ehg_stage

# Check Codex user expiry
psql -h 127.0.0.1 -p 5434 -U ehg_admin -d ehg_stage -c "SELECT usename, valuntil FROM pg_user WHERE usename='codex_staging';"

# Extend Codex user (if needed)
psql -h 127.0.0.1 -p 5434 -U ehg_admin -d ehg_stage -c "ALTER USER codex_staging VALID UNTIL NOW() + INTERVAL '8 hours';"
```

## Health Checks

```bash
# Container health
docker-compose ps

# Database ready
docker exec ehg_staging_db pg_isready

# Bootstrap completed
PGPASSWORD=cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG psql -h 127.0.0.1 -p 5434 -U codex_staging -d ehg_stage \
  -c "SELECT * FROM audit.bootstrap_status;"

# RLS enabled
PGPASSWORD=cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG psql -h 127.0.0.1 -p 5434 -U codex_staging -d ehg_stage \
  -c "SHOW row_security;"
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs postgres_staging

# Verify port availability
lsof -i :5434
```

### Connection refused
```bash
# Ensure container is running
docker-compose ps

# Check firewall (WSL)
# No action needed for localhost

# Test with docker exec
docker exec ehg_staging_db psql -U ehg_admin -d ehg_stage -c "SELECT 1;"
```

### Permission denied
```bash
# Verify user exists
docker exec ehg_staging_db psql -U ehg_admin -d ehg_stage \
  -c "SELECT * FROM pg_user WHERE usename='codex_staging';"

# Check grants
docker exec ehg_staging_db psql -U ehg_admin -d ehg_stage \
  -c "\du codex_staging"
```

## Security Notes

1. **Time-boxed access**: Codex user expires in 8 hours
2. **No DDL rights**: Cannot modify schema
3. **RLS enforced**: Row-level security active
4. **Audit trail**: All changes logged to audit.change_log
5. **Network isolated**: Dedicated Docker network
6. **No production data**: Schema-only environment

## Emergency Reset

```bash
# Full nuclear option (destroys everything)
docker-compose down -v
docker system prune -f
rm -rf /var/lib/docker/volumes/ehg_staging_data

# Then restart fresh
docker-compose up -d
```