import { Router } from 'express';
import { OAuthRepository } from '../data/oauth-repository.js';

const router = Router();
const oauthRepo = new OAuthRepository();

// Seed a default tenant for demo purposes
oauthRepo.createTenant({ id: 'default-tenant', name: 'Demo Org', github_org_id: 'demo-org', plan: 'pro' });

// POST /oauth/authorize - Initiate OAuth flow
router.post('/authorize', (req, res) => {
  const { tenant_id } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id is required' });
  }
  const tenant = oauthRepo.getTenant(tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  const code = `mock-auth-code-${Date.now()}`;
  res.json({
    authorization_url: `https://github.com/apps/codeguardian-ci/installations/new?state=${code}`,
    code,
    tenant_id
  });
});

// GET /oauth/callback - Handle OAuth callback
router.get('/callback', (req, res) => {
  const { code, tenant_id } = req.query;
  if (!code || !tenant_id) {
    return res.status(400).json({ error: 'code and tenant_id are required' });
  }
  const tenant = oauthRepo.getTenant(tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  try {
    const installation = oauthRepo.createInstallation({
      id: `inst-${Date.now()}`,
      tenant_id,
      installation_id: Math.floor(Math.random() * 100000),
      status: 'active',
      permissions: ['read', 'write', 'pull_requests'],
      repos: [`${tenant.github_org_id}/main-repo`]
    });
    res.json({ message: 'Installation created', installation });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /oauth/token - Issue mock access token
router.post('/token', (req, res) => {
  const { installation_id } = req.body;
  if (!installation_id) {
    return res.status(400).json({ error: 'installation_id is required' });
  }
  const installations = oauthRepo.listInstallations();
  const inst = installations.find(i => String(i.installation_id) === String(installation_id));
  if (!inst) {
    return res.status(401).json({ error: 'Installation not found' });
  }
  res.json({
    access_token: `mock-token-${inst.id}-${Date.now()}`,
    token_type: 'bearer',
    expires_in: 3600,
    permissions: inst.permissions,
    installation_id: inst.installation_id
  });
});

// POST /oauth/refresh - Refresh mock token
router.post('/refresh', (req, res) => {
  const { access_token } = req.body;
  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }
  res.json({
    access_token: `mock-token-refreshed-${Date.now()}`,
    token_type: 'bearer',
    expires_in: 3600
  });
});

// GET /oauth/permissions/:installId - Check installation permissions
router.get('/permissions/:installId', (req, res) => {
  const inst = oauthRepo.getInstallation(req.params.installId);
  if (!inst) {
    return res.status(404).json({ error: 'Installation not found' });
  }
  res.json({
    installation_id: inst.installation_id,
    permissions: inst.permissions,
    repos: inst.repos,
    status: inst.status
  });
});

export { router as oauthRouter, oauthRepo };
