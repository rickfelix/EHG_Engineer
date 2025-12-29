/**
 * MARKET-PULSE PERSONA TEMPLATES
 * v3.2.0 Productization Package - Operation 'Strategic Sight'
 *
 * THE LAW: Agents write for Customers, not DBAs.
 * THE LAW: Every venture has a defined end-user persona.
 * THE LAW: Stories written for FORBIDDEN_PERSONAS are BLOCKED.
 *
 * This module provides:
 * 1. Pre-defined personas for each venture in the 5-Venture Swarm
 * 2. Persona validation utilities
 * 3. Forbidden persona blacklist
 *
 * @module persona-templates
 * @version 3.2.0
 */

// =============================================================================
// FORBIDDEN PERSONAS - Stories written for these are BLOCKED
// =============================================================================
export const FORBIDDEN_PERSONAS = [
  'developer',
  'dba',
  'admin',
  'engineer',
  'ops',
  'devops',
  'sysadmin',
  'backend',
  'frontend',
  'qa',
  'tester',
  'it',
  'infrastructure',
  'platform'
];

// =============================================================================
// APPROVED PERSONAS - Stories must target one of these
// =============================================================================
export const APPROVED_PERSONAS = [
  'founder',
  'customer',
  'investor',
  'user',
  'patient',
  'cfo',
  'clinician',
  'physician',
  'executive',
  'manager',
  'owner',
  'chairman',
  'director',
  'analyst',
  'buyer',
  'client',
  'stakeholder',
  'partner',
  'subscriber',
  'member'
];

// =============================================================================
// 5-VENTURE SWARM PERSONAS
// =============================================================================

/**
 * MedSync Venture Personas
 * Healthcare data synchronization and patient engagement
 */
export const MEDSYNC_PERSONAS = {
  patient: {
    name: 'Sarah Chen',
    role: 'Chronic Care Patient',
    demographics: 'Age 45-65, manages diabetes + hypertension',
    goal: 'Understand my health data without medical jargon',
    frustration: 'I can never remember what my doctor said. Too many apps, none talk to each other.',
    delight: 'A 2-second glance tells me if I need to act. My medication reminders actually work.',
    scenario: 'Sarah checks her MedSync dashboard each morning before breakfast to see her glucose trend and medication schedule.',
    success_metric: 'Time to understand health status: <2 seconds'
  },
  clinician: {
    name: 'Dr. Marcus Webb',
    role: 'Family Medicine Physician',
    demographics: '15 years experience, sees 25 patients/day',
    goal: 'See patient status without digging through charts',
    frustration: 'I have 15 minutes per patient and 20 tabs open. EHR is a data graveyard.',
    delight: 'Dashboard shows me what matters before I walk in. Alerts are actionable, not noise.',
    scenario: 'Dr. Webb reviews his morning panel on MedSync, immediately seeing which patients need attention vs routine follow-ups.',
    success_metric: 'Pre-visit prep time: <30 seconds per patient'
  },
  caregiver: {
    name: 'Maria Santos',
    role: 'Family Caregiver',
    demographics: 'Age 40-55, manages care for elderly parent',
    goal: 'Keep track of my mother\'s health without constant phone calls',
    frustration: 'I never know if she took her medications. Doctor visits are surprises.',
    delight: 'I see everything my mom\'s doctor sees. No more emergency room surprises.',
    scenario: 'Maria checks her mother\'s MedSync from work, sees medication compliance and upcoming appointments.',
    success_metric: 'Caregiver anxiety reduction: 50% fewer "check-in" calls'
  }
};

/**
 * FinTrack Venture Personas
 * Financial operations and real-time business intelligence
 */
export const FINTRACK_PERSONAS = {
  cfo: {
    name: 'Angela Rodriguez',
    role: 'CFO, Mid-Market SaaS',
    demographics: '$10-50M ARR company, 50-200 employees',
    goal: 'Know my runway and burn without spreadsheets',
    frustration: 'Month-end close takes 2 weeks to get visibility. Board meetings are fire drills.',
    delight: 'Real-time P&L that I can share with the board. Scenario modeling in seconds.',
    scenario: 'Angela opens FinTrack before her board meeting, exports a runway forecast with 3 scenarios.',
    success_metric: 'Time to generate board report: <5 minutes'
  },
  controller: {
    name: 'James Park',
    role: 'Financial Controller',
    demographics: '10 years experience, CPA',
    goal: 'Automate reconciliation and close faster',
    frustration: 'Manual data entry and version control hell. Auditors always want more.',
    delight: 'AI catches anomalies before I do. Audit trail is automatic.',
    scenario: 'James uses FinTrack to reconcile monthly transactions, AI flags 3 anomalies for review.',
    success_metric: 'Month-end close: from 10 days to 3 days'
  },
  investor: {
    name: 'David Chen',
    role: 'Venture Partner',
    demographics: 'Series A/B investor, 12 portfolio companies',
    goal: 'Portfolio health at a glance without chasing founders for updates',
    frustration: 'Monthly updates are stale by the time I read them. Surprised by bad news.',
    delight: 'Real-time portfolio dashboard. Founders can\'t hide problems.',
    scenario: 'David checks FinTrack portfolio view every Monday, immediately sees which companies need attention.',
    success_metric: 'Time to detect portfolio problem: <24 hours'
  }
};

/**
 * LegalFlow Venture Personas
 * Contract lifecycle and legal operations
 */
export const LEGALFLOW_PERSONAS = {
  generalCounsel: {
    name: 'Patricia Williams',
    role: 'General Counsel',
    demographics: '20 years experience, manages team of 5',
    goal: 'Reduce contract cycle time without adding headcount',
    frustration: 'Sales closes deals, legal is always the bottleneck. Can\'t find prior art.',
    delight: 'Self-service contracts for standard deals. AI drafts based on our playbook.',
    scenario: 'Patricia reviews LegalFlow\'s weekly summary: 15 contracts auto-approved, 3 need her attention.',
    success_metric: 'Contract cycle time: from 14 days to 3 days'
  },
  salesRep: {
    name: 'Mike Johnson',
    role: 'Account Executive',
    demographics: '$500K quota, enterprise deals',
    goal: 'Close deals faster without legal holding me up',
    frustration: 'Every redline takes a week. I lose momentum and deals.',
    delight: 'Standard terms auto-approve. Only escalate what matters.',
    scenario: 'Mike sends a contract through LegalFlow, gets approval in 2 hours instead of 2 weeks.',
    success_metric: 'Sales velocity: 30% faster deal close'
  },
  procurement: {
    name: 'Linda Chen',
    role: 'Procurement Manager',
    demographics: 'Manages vendor relationships for 200-person company',
    goal: 'Track all vendor contracts and renewals in one place',
    frustration: 'Auto-renewals catch me by surprise. Can\'t negotiate because I forget.',
    delight: 'Renewal alerts 90 days out. Spend analytics show leverage.',
    scenario: 'Linda gets a LegalFlow alert that AWS contract renews in 90 days, reviews spend analytics to prepare.',
    success_metric: 'Contract renewal savings: 15% average'
  }
};

/**
 * PropTech Venture Personas
 * Property management and tenant experience
 */
export const PROPTECH_PERSONAS = {
  propertyManager: {
    name: 'Robert Taylor',
    role: 'Property Manager',
    demographics: 'Manages 500+ units across 5 properties',
    goal: 'Handle maintenance requests without drowning in paperwork',
    frustration: 'Tenants call me directly. I\'m always reactive, never proactive.',
    delight: 'AI triages maintenance. Tenants self-serve 80% of issues.',
    scenario: 'Robert checks PropTech dashboard, sees all open tickets prioritized by urgency and tenant sentiment.',
    success_metric: 'Maintenance response time: <4 hours average'
  },
  tenant: {
    name: 'Jessica Martinez',
    role: 'Apartment Tenant',
    demographics: 'Young professional, expects digital-first experience',
    goal: 'Report issues and pay rent without calling anyone',
    frustration: 'My landlord never responds. I have to call 3 times to get anything fixed.',
    delight: 'I submit a request, get a tracking number, and know exactly when someone\'s coming.',
    scenario: 'Jessica reports a leaky faucet via PropTech app, gets confirmation and appointment within 2 hours.',
    success_metric: 'Tenant satisfaction: NPS > 60'
  },
  owner: {
    name: 'William Chen',
    role: 'Property Owner/Investor',
    demographics: 'Owns 3 properties, 50 units total',
    goal: 'Maximize NOI without being a full-time landlord',
    frustration: 'Property manager calls me for every decision. I don\'t know my true returns.',
    delight: 'Real-time NOI dashboard. Only escalations that actually need me.',
    scenario: 'William checks PropTech owner portal quarterly, sees NOI trend and projected returns.',
    success_metric: 'Owner time investment: <2 hours/month per property'
  }
};

/**
 * EdTech Venture Personas
 * Learning management and student engagement
 */
export const EDTECH_PERSONAS = {
  student: {
    name: 'Alex Thompson',
    role: 'Online Learner',
    demographics: 'Age 25-40, working professional upskilling',
    goal: 'Learn new skills without quitting my job',
    frustration: 'Courses are boring. I forget everything after the quiz.',
    delight: 'Personalized learning path. Applied projects, not just videos.',
    scenario: 'Alex logs into EdTech after work, completes a 15-minute module on their phone during commute.',
    success_metric: 'Course completion rate: >70%'
  },
  instructor: {
    name: 'Dr. Karen Lee',
    role: 'Course Creator/Instructor',
    demographics: '15 years teaching experience, subject matter expert',
    goal: 'Create engaging courses without being a video production expert',
    frustration: 'Udemy/Coursera takes 70% of my revenue. I can\'t see what students struggle with.',
    delight: 'AI helps me create content. Real-time analytics show where students drop off.',
    scenario: 'Dr. Lee reviews EdTech analytics, sees students struggling in Module 3, adds a clarifying video.',
    success_metric: 'Instructor time to create course: 50% reduction'
  },
  enterpriseTrainer: {
    name: 'Tom Morrison',
    role: 'L&D Manager',
    demographics: 'Corporate training for 1000+ employees',
    goal: 'Track compliance training and skill development at scale',
    frustration: 'Excel spreadsheets to track who completed what. Reporting is a nightmare.',
    delight: 'Real-time compliance dashboard. Skills matrix shows gaps instantly.',
    scenario: 'Tom runs quarterly skills report in EdTech, identifies 3 teams that need additional training.',
    success_metric: 'Compliance reporting time: from 2 days to 5 minutes'
  }
};

// =============================================================================
// THE CHAIRMAN PERSONA (Applies to ALL Ventures)
// =============================================================================
export const CHAIRMAN_PERSONA = {
  name: 'The Chairman',
  role: 'Strategic Investor',
  demographics: 'Oversees 5+ ventures, makes capital allocation decisions',
  goal: 'Glanceable portfolio health in <2 seconds',
  frustration: 'Raw data instead of strategic intelligence. Admin panels, not command centers.',
  delight: 'A Glass Cockpit, not a Boiler Room. Decisions, not data.',
  scenario: 'The Chairman opens the dashboard, immediately sees which ventures need attention and which are on track.',
  success_metric: 'Portfolio comprehension time: <2 seconds'
};

// =============================================================================
// PERSONA VALIDATION UTILITIES
// =============================================================================

/**
 * Check if a persona is forbidden (tech-focused)
 * @param {string} persona - The persona to check
 * @returns {boolean} True if the persona is forbidden
 */
export function isForbiddenPersona(persona) {
  const normalized = persona.toLowerCase().trim();
  return FORBIDDEN_PERSONAS.some(fp =>
    normalized.includes(fp) || fp.includes(normalized)
  );
}

/**
 * Check if a persona is approved (customer-focused)
 * @param {string} persona - The persona to check
 * @returns {boolean} True if the persona is approved
 */
export function isApprovedPersona(persona) {
  const normalized = persona.toLowerCase().trim();
  return APPROVED_PERSONAS.some(ap =>
    normalized.includes(ap) || ap.includes(normalized)
  );
}

/**
 * Get all personas for a specific venture
 * @param {string} ventureName - The venture name (medsync, fintrack, legalflow, proptech, edtech)
 * @returns {Object} The personas for that venture
 */
export function getVenturePersonas(ventureName) {
  const ventureMap = {
    medsync: MEDSYNC_PERSONAS,
    fintrack: FINTRACK_PERSONAS,
    legalflow: LEGALFLOW_PERSONAS,
    proptech: PROPTECH_PERSONAS,
    edtech: EDTECH_PERSONAS
  };

  return ventureMap[ventureName.toLowerCase()] || null;
}

/**
 * Get a suggested persona for a user story based on venture context
 * @param {string} ventureName - The venture name
 * @param {string} storyContext - Context about what the story is about
 * @returns {Object} A suggested persona with rationale
 */
export function suggestPersona(ventureName, storyContext) {
  const personas = getVenturePersonas(ventureName);
  if (!personas) {
    return {
      persona: CHAIRMAN_PERSONA,
      rationale: 'No venture-specific personas found. Using Chairman persona as default.'
    };
  }

  const contextLower = storyContext.toLowerCase();

  // Simple keyword matching to suggest a persona
  for (const [_key, persona] of Object.entries(personas)) {
    const roleKeywords = persona.role.toLowerCase().split(/\s+/);
    if (roleKeywords.some(kw => contextLower.includes(kw))) {
      return {
        persona,
        rationale: `Story context matches ${persona.role} persona.`
      };
    }
  }

  // Default to first persona in the venture
  const firstPersona = Object.values(personas)[0];
  return {
    persona: firstPersona,
    rationale: `No specific match found. Defaulting to ${firstPersona.role}.`
  };
}

// =============================================================================
// PERSONA TEMPLATE FOR STORY WRITING
// =============================================================================
export const STORY_TEMPLATE = {
  format: 'As a {persona.role}, I want to {action} so that {benefit}.',
  required_fields: ['persona', 'action', 'benefit'],
  persona_requirements: {
    must_not_be: FORBIDDEN_PERSONAS,
    should_be: APPROVED_PERSONAS,
    should_include: ['goal', 'frustration', 'delight']
  },
  acceptance_criteria_template: {
    format: 'Given {context}, When {action}, Then {outcome}',
    minimum_count: 2,
    must_include: ['happy_path', 'error_path']
  }
};

export default {
  FORBIDDEN_PERSONAS,
  APPROVED_PERSONAS,
  MEDSYNC_PERSONAS,
  FINTRACK_PERSONAS,
  LEGALFLOW_PERSONAS,
  PROPTECH_PERSONAS,
  EDTECH_PERSONAS,
  CHAIRMAN_PERSONA,
  isForbiddenPersona,
  isApprovedPersona,
  getVenturePersonas,
  suggestPersona,
  STORY_TEMPLATE
};
