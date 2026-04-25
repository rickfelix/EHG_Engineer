export const SECRET_PATTERNS = Object.freeze([
  { name: 'anthropic_api_key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'openai_api_key', pattern: /sk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'aws_access_key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'github_token', pattern: /ghp_[A-Za-z0-9]{36,}/g },
  { name: 'github_fine_grained_pat', pattern: /github_pat_[A-Za-z0-9_]{82,}/g },
  { name: 'private_key_block', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'jwt_token', pattern: /eyJ[A-Za-z0-9_=-]{8,}\.eyJ[A-Za-z0-9_=-]{8,}\.[A-Za-z0-9_\-+/=]{8,}/g },
  { name: 'slack_token', pattern: /xox[abps]-[A-Za-z0-9-]{20,}/g },
  { name: 'stripe_live_key', pattern: /(?:sk|pk|rk)_live_[A-Za-z0-9]{24,}/g },
  { name: 'google_api_key', pattern: /AIza[A-Za-z0-9_-]{35}/g },
  { name: 'sendgrid_api_key', pattern: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}/g },
  { name: 'postgres_conn_with_password', pattern: /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/g },
]);

export class SanitizationViolation extends Error {
  constructor(message, hits) {
    super(message);
    this.name = 'SanitizationViolation';
    this.hits = hits;
  }
}

export function scanForSecrets(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const hits = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) hits.push({ kind: name, count: matches.length });
  }
  return hits;
}

export function assertSanitized(fixture, fixturePath) {
  const all = [
    ...scanForSecrets(fixture.input),
    ...scanForSecrets(fixture.v1_output),
    ...scanForSecrets(fixture.validator_result),
  ];
  if (all.length > 0) {
    throw new SanitizationViolation(
      `Fixture ${fixturePath} contains apparent secrets: ${all.map(h => `${h.kind}×${h.count}`).join(', ')}`,
      all
    );
  }
  return { ok: true };
}
