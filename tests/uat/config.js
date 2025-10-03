export const EHG_CONFIG = {
  baseURL: process.env.BASE_URL || 'http://localhost:8080',
  routes: {
    login: '/login',
    dashboard: '/chairman',  // EHG's main dashboard
    ventures: '/ventures',
    chairman: '/chairman',
    settings: '/settings',
    profile: '/profile',
    reports: '/reports',
    analytics: '/analytics',
    aiAgents: '/ai-agents',
    eva: '/eva-orchestration',
    governance: '/governance',
    security: '/security',
    performance: '/performance',
    notifications: '/notifications'
  },
  selectors: {
  "loginForm": {
    "email": "#signin-email",
    "password": "#signin-password",
    "submitButton": "button:has-text('Sign In')",
    "signupEmail": "#signup-email",
    "signupPassword": "#signup-password",
    "signupButton": "button:has-text('Sign Up')"
  },
  "navigation": {
    "sidebar": "[data-testid=\"sidebar\"]",
    "mainNav": "nav[role=\"navigation\"]",
    "userMenu": "[data-testid=\"user-menu\"]"
  },
  "dashboard": {
    "widgets": "[data-testid=\"dashboard-widget\"]",
    "charts": "canvas, svg.chart",
    "metrics": "[data-testid=\"metric-card\"]"
  },
  "ventures": {
    "list": "[data-testid=\"ventures-list\"]",
    "createButton": "button:has-text(\"New Venture\")",
    "ventureCard": "[data-testid=\"venture-card\"]"
  }
},
  timeouts: {
    short: 5000,
    medium: 10000,
    long: 30000
  },
  testUsers: {
    admin: {
      email: process.env.ADMIN_EMAIL || 'admin@ehg.com',
      password: process.env.ADMIN_PASSWORD || 'Admin123!'
    },
    user: {
      email: process.env.TEST_EMAIL || 'test@ehg.com',
      password: process.env.TEST_PASSWORD || 'Test123!'
    }
  }
};

export default EHG_CONFIG;
