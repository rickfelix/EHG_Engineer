/**
 * Cost Optimization Sub-Agent - Configuration
 * Free tier limits and thresholds
 */

// Supabase free tier limits
export const LIMITS = {
  database: {
    size: 500 * 1024 * 1024, // 500MB
    rows: 100000, // Approximate for free tier
    warning: 0.8, // Warn at 80%
    critical: 0.95 // Critical at 95%
  },
  bandwidth: {
    monthly: 2 * 1024 * 1024 * 1024, // 2GB
    daily: 68 * 1024 * 1024, // ~68MB/day average
    warning: 0.8,
    critical: 0.95
  },
  api: {
    hourly: 1000, // Reasonable limit
    perMinute: 100,
    warning: 0.8,
    critical: 0.95
  },
  storage: {
    total: 1024 * 1024 * 1024, // 1GB
    warning: 0.8,
    critical: 0.95
  }
};

// Expensive code patterns to detect
export const EXPENSIVE_PATTERNS = [
  {
    pattern: /select\(\'\*'\)/gi,
    type: 'SELECT_ALL',
    cost: 'HIGH',
    message: 'Selecting all columns is expensive',
    fix: 'Select only needed columns'
  },
  {
    pattern: /\.storage\..*upload/gi,
    type: 'FILE_UPLOAD',
    cost: 'MEDIUM',
    message: 'File uploads consume bandwidth',
    fix: 'Compress and optimize files before upload'
  },
  {
    pattern: /setInterval|setTimeout.*[1-9]\d{0,2}(?!\d)/gi,
    type: 'FREQUENT_POLLING',
    cost: 'HIGH',
    message: 'Frequent polling increases API calls',
    fix: 'Use realtime subscriptions or increase interval'
  },
  {
    pattern: /Promise\.all\(.*map.*supabase/gi,
    type: 'PARALLEL_QUERIES',
    cost: 'HIGH',
    message: 'Parallel queries spike API usage',
    fix: 'Use batch operations or sequential processing'
  },
  {
    pattern: /while.*await.*supabase/gi,
    type: 'LOOP_QUERIES',
    cost: 'CRITICAL',
    message: 'Queries in loops are extremely expensive',
    fix: 'Refactor to use single query with conditions'
  }
];

// Cacheable patterns
export const CACHEABLE_PATTERNS = [
  {
    pattern: /supabase.*select.*from\(['"]users['"]/gi,
    suggestion: 'Cache user data in localStorage/sessionStorage',
    impact: 'Reduce repeated user lookups'
  },
  {
    pattern: /fetch.*\/api\/config/gi,
    suggestion: 'Cache configuration data on client',
    impact: 'Reduce config API calls'
  },
  {
    pattern: /supabase.*select.*order.*limit/gi,
    suggestion: 'Cache paginated results',
    impact: 'Reduce repeated list queries'
  }
];

// Known tables for fallback analysis
export const KNOWN_TABLES = [
  'strategic_directives_v2',
  'product_requirements_v2',
  'execution_sequences',
  'leo_audit_log'
];
