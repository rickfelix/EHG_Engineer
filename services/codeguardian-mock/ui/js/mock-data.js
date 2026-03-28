export const orgs = [
  { id: 'org-1', name: 'Acme Corp', repos_count: 12 },
  { id: 'org-2', name: 'TechStart Inc', repos_count: 5 },
  { id: 'org-3', name: 'DevOps Labs', repos_count: 8 }
];

export const repos = [
  { id: 'r1', name: 'api-gateway', org_id: 'org-1', status: 'passing', last_scan: '2026-03-28T10:00:00Z', findings: { critical: 0, high: 0, medium: 2, low: 5 } },
  { id: 'r2', name: 'auth-service', org_id: 'org-1', status: 'failing', last_scan: '2026-03-28T09:30:00Z', findings: { critical: 2, high: 3, medium: 1, low: 0 } },
  { id: 'r3', name: 'web-frontend', org_id: 'org-1', status: 'passing', last_scan: '2026-03-28T08:00:00Z', findings: { critical: 0, high: 0, medium: 0, low: 3 } },
  { id: 'r4', name: 'data-pipeline', org_id: 'org-2', status: 'pending', last_scan: null, findings: { critical: 0, high: 0, medium: 0, low: 0 } },
  { id: 'r5', name: 'mobile-app', org_id: 'org-2', status: 'failing', last_scan: '2026-03-27T22:00:00Z', findings: { critical: 1, high: 2, medium: 4, low: 8 } },
  { id: 'r6', name: 'infra-terraform', org_id: 'org-3', status: 'passing', last_scan: '2026-03-28T11:00:00Z', findings: { critical: 0, high: 1, medium: 0, low: 2 } }
];

export const findings = [
  { id: 'f1', repo_id: 'r2', severity: 'critical', title: 'SQL Injection in login handler', file: 'src/auth/login.js', line: 42, description: 'User input passed directly to SQL query without parameterization.' },
  { id: 'f2', repo_id: 'r2', severity: 'critical', title: 'Hardcoded API key in config', file: 'src/config/keys.js', line: 8, description: 'Production API key committed to source code.' },
  { id: 'f3', repo_id: 'r2', severity: 'high', title: 'Missing rate limiting on auth endpoints', file: 'src/routes/auth.js', line: 15, description: 'Authentication endpoints lack rate limiting, vulnerable to brute force.' },
  { id: 'f4', repo_id: 'r2', severity: 'high', title: 'Weak password hashing algorithm', file: 'src/auth/hash.js', line: 23, description: 'Using MD5 instead of bcrypt for password hashing.' },
  { id: 'f5', repo_id: 'r2', severity: 'high', title: 'CORS wildcard in production', file: 'src/middleware/cors.js', line: 5, description: 'Access-Control-Allow-Origin set to * in production config.' },
  { id: 'f6', repo_id: 'r2', severity: 'medium', title: 'Deprecated dependency detected', file: 'package.json', line: 12, description: 'express-validator@4 is deprecated, upgrade to v7.' },
  { id: 'f7', repo_id: 'r5', severity: 'critical', title: 'Insecure data storage on device', file: 'src/storage/local.kt', line: 67, description: 'Sensitive user tokens stored in SharedPreferences without encryption.' },
  { id: 'f8', repo_id: 'r5', severity: 'high', title: 'Certificate pinning not implemented', file: 'src/network/client.kt', line: 12, description: 'HTTPS connections do not verify server certificate pins.' },
  { id: 'f9', repo_id: 'r5', severity: 'high', title: 'Debug logging in production build', file: 'src/utils/logger.kt', line: 3, description: 'Verbose logging enabled in release builds, leaking sensitive data.' },
  { id: 'f10', repo_id: 'r5', severity: 'medium', title: 'Missing input validation on forms', file: 'src/ui/forms/LoginForm.kt', line: 45, description: 'Email and password fields accept any input without validation.' },
  { id: 'f11', repo_id: 'r5', severity: 'medium', title: 'Unused permissions in manifest', file: 'AndroidManifest.xml', line: 8, description: 'Camera and location permissions declared but not used.' },
  { id: 'f12', repo_id: 'r5', severity: 'medium', title: 'Memory leak in activity lifecycle', file: 'src/ui/MainActivity.kt', line: 89, description: 'Static reference to activity context prevents garbage collection.' },
  { id: 'f13', repo_id: 'r5', severity: 'medium', title: 'Hardcoded strings', file: 'src/ui/screens/HomeScreen.kt', line: 20, description: 'UI strings hardcoded instead of using resources/i18n.' },
  { id: 'f14', repo_id: 'r5', severity: 'low', title: 'Inconsistent naming conventions', file: 'src/models/User.kt', line: 1, description: 'Class uses camelCase for properties instead of project convention.' },
  { id: 'f15', repo_id: 'r5', severity: 'low', title: 'Missing KDoc comments', file: 'src/api/ApiService.kt', line: 1, description: 'Public API methods lack documentation comments.' },
  { id: 'f16', repo_id: 'r5', severity: 'low', title: 'Redundant null checks', file: 'src/utils/Extensions.kt', line: 34, description: 'Non-nullable type checked for null unnecessarily.' },
  { id: 'f17', repo_id: 'r1', severity: 'medium', title: 'Request timeout not configured', file: 'src/proxy/handler.js', line: 55, description: 'Upstream service requests have no timeout, may hang indefinitely.' },
  { id: 'f18', repo_id: 'r1', severity: 'medium', title: 'Missing health check endpoint docs', file: 'src/routes/health.js', line: 1, description: 'Health check endpoint not documented in OpenAPI spec.' },
  { id: 'f19', repo_id: 'r1', severity: 'low', title: 'Console.log in production code', file: 'src/middleware/logger.js', line: 12, description: 'Debug console.log statements left in production code.' },
  { id: 'f20', repo_id: 'r6', severity: 'high', title: 'Overly permissive IAM policy', file: 'modules/iam/main.tf', line: 23, description: 'IAM role grants * permissions on S3 bucket.' },
  { id: 'f21', repo_id: 'r3', severity: 'low', title: 'Unused CSS classes', file: 'src/styles/main.css', line: 145, description: '15 CSS classes defined but never referenced in components.' },
  { id: 'f22', repo_id: 'r3', severity: 'low', title: 'Missing alt text on images', file: 'src/components/Hero.tsx', line: 28, description: 'Decorative images missing aria-hidden or alt text.' },
  { id: 'f23', repo_id: 'r3', severity: 'low', title: 'Bundle size warning', file: 'webpack.config.js', line: 1, description: 'Main bundle exceeds 250KB recommended limit (312KB).' }
];

export function getMetrics() {
  const total = repos.length;
  const passing = repos.filter(r => r.status === 'passing').length;
  const failing = repos.filter(r => r.status === 'failing').length;
  const pending = repos.filter(r => r.status === 'pending').length;
  const totalFindings = findings.length;
  const critical = findings.filter(f => f.severity === 'critical').length;
  return { total, passing, failing, pending, totalFindings, critical };
}

export function getFindingsForRepo(repoId) {
  return findings.filter(f => f.repo_id === repoId);
}

export function getReposForOrg(orgId) {
  return repos.filter(r => r.org_id === orgId);
}
