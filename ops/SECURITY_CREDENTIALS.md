# 🔒 Security & Credentials Management

## ⚠️ CRITICAL: Credential Rotation Required

**IMMEDIATE ACTION REQUIRED**: Database credentials may have been exposed in conversation logs. Follow these steps:

1. **Generate new database password** in Supabase Dashboard
2. **Update GitHub Secrets** (NOT Variables):
   - `PGHOST_PROD`
   - `PGPORT_PROD`
   - `PGDATABASE_PROD`
   - `PGUSER_PROD`
   - `PGPASSWORD_PROD` (new password)
3. **Revoke old password** in Supabase
4. **Clear shell history**: `history -c && history -w`

## GitHub Secrets Configuration

### Required Secrets
```bash
# Production Database (Supabase)
PGHOST_PROD=aws-1-us-east-1.pooler.supabase.com
PGPORT_PROD=5432
PGDATABASE_PROD=postgres
PGUSER_PROD=postgres.dedlbzhpgkmetvhbkyzq
PGPASSWORD_PROD=[ROTATED_PASSWORD]

# Optional: Service Role for admin operations
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_KEY]
```

### Setting Secrets via GitHub CLI
```bash
# Set all production database secrets
gh secret set PGHOST_PROD -b "aws-1-us-east-1.pooler.supabase.com"
gh secret set PGPORT_PROD -b "5432"
gh secret set PGDATABASE_PROD -b "postgres"
gh secret set PGUSER_PROD -b "postgres.dedlbzhpgkmetvhbkyzq"
gh secret set PGPASSWORD_PROD -b "[NEW_PASSWORD]"
```

## Security Best Practices

### ✅ DO
- Store credentials only in GitHub Secrets
- Use pooler connections for production
- Rotate credentials regularly (quarterly minimum)
- Use read-only credentials where possible
- Enable SSL/TLS (sslmode=require)

### ❌ DON'T
- Commit credentials to repository
- Use GitHub Variables for secrets
- Share credentials in issues/PRs
- Log connection strings
- Use hardcoded passwords in scripts

## Connection String Patterns

### Never commit these patterns:
```
postgresql://user:password@host/database
postgres://postgres.project:PASSWORD@host
PGPASSWORD=anything psql ...
export PGPASSWORD='...'
```

### Safe patterns (using secrets):
```yaml
env:
  PGHOST: ${{ secrets.PGHOST_PROD }}
  PGPASSWORD: ${{ secrets.PGPASSWORD_PROD }}
```

## Credential Rotation Schedule

| Component | Rotation Frequency | Last Rotated | Next Rotation |
|-----------|-------------------|--------------|---------------|
| Database Password | Quarterly | 2025-09-22 | 2025-12-22 |
| Service Role Key | Annually | - | - |
| GitHub PAT | 90 days | - | - |

## Incident Response

If credentials are exposed:
1. **Immediately rotate** affected credentials
2. **Audit access logs** for unauthorized use
3. **Update all workflows** with new credentials
4. **Document incident** with timestamp and actions taken
5. **Review and update** security practices

## Monitoring

- Enable Supabase audit logs
- Monitor GitHub Actions logs for credential exposure
- Set up alerts for failed authentication attempts
- Review workflow runs for security compliance

---

*Last Updated: 2025-09-22*
*Security Contact: [Your Security Team]*