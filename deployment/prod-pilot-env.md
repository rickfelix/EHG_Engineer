# Production Pilot Environment Configuration

## Environment Variables (Gates OFF for Pilot)

```bash
# Feature flags - PRODUCTION PILOT
FEATURE_AUTO_STORIES=true      # Enable automatic story generation
FEATURE_STORY_UI=true           # Enable UI components
FEATURE_STORY_AGENT=true        # Enable story agent
FEATURE_STORY_GATES=false       # GATES OFF for pilot phase

# Vite build flags (for frontend)
VITE_FEATURE_STORY_UI=true
VITE_FEATURE_STORY_GATES=false  # Must match backend

# Database connection (production)
NEXT_PUBLIC_SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[production-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[production-service-role-key]

# CI/CD webhook token
SERVICE_TOKEN_PROD=[production-service-token]  # Must be service-role token

# API endpoints
STORY_WEBHOOK_URL=https://[production-domain]/api/stories/verify
STORY_HEALTH_URL=https://[production-domain]/api/stories/health

# Performance settings
STORY_QUERY_TIMEOUT=5000        # 5 second timeout
STORY_CACHE_TTL=300              # 5 minute cache
MAX_CONCURRENT_VERIFICATIONS=10  # Limit concurrent updates

# Monitoring
ENABLE_STORY_METRICS=true
STORY_LOG_LEVEL=info
```

## Deployment Steps

1. **Set environment variables** in production deployment system
2. **Verify SERVICE_TOKEN_PROD** is a service-role token (NOT user token)
3. **Deploy with gates OFF** - critical for pilot phase
4. **Monitor for 1 week** before enabling gates

## Rollback Configuration

To instantly rollback, set these flags and redeploy:

```bash
FEATURE_STORY_AGENT=false
FEATURE_AUTO_STORIES=false
FEATURE_STORY_UI=false
FEATURE_STORY_GATES=false
```

Schema remains in place (additive-only design).