/**
 * QA Engineering Director - Configuration
 * Path constants and default options
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const EHG_ROOT = path.resolve(__dirname, '../../../ehg');

// Default options for QA Director execution
export const DEFAULT_OPTIONS = {
  targetApp: 'ehg',
  skipBuild: false,
  skipMigrations: false,
  autoExecuteMigrations: true,
  forceManualTests: false,
  smokeOnly: false,
  skipTestPlanGeneration: false
};

// UI-related categories and keywords
export const UI_CATEGORIES = ['UI', 'Feature', 'Dashboard', 'Component', 'Page', 'Frontend'];
export const UI_KEYWORDS = ['component', 'page', 'dashboard', 'interface', 'form', 'button', 'modal'];
