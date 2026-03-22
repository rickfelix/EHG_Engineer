#!/usr/bin/env node
/**
 * create-ehg-venture - EHG Venture Project Scaffold
 *
 * Usage:
 *   npx create-ehg-venture my-venture
 *   npx create-ehg-venture my-venture --skip-install
 *
 * Creates a new venture project with:
 *   - React + Vite + TypeScript (EHG stack)
 *   - @ehg/design-tokens, @ehg/tailwind-preset, @ehg/lint-config
 *   - Supabase config, TanStack Query, Zustand, React Hook Form + Zod
 *   - Standard project structure
 *   - Pre-configured testing (Vitest + Playwright)
 *   - CI/CD workflow template
 *
 * SD: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const PACKAGE_VERSIONS = {
  react: '^18.3.0',
  'react-dom': '^18.3.0',
  'react-router-dom': '^6.30.0',
  '@tanstack/react-query': '^5.83.0',
  zustand: '^5.0.0',
  'react-hook-form': '^7.61.0',
  zod: '^3.25.0',
  '@supabase/supabase-js': '^2.56.0',
  tailwindcss: '^3.4.0',
  autoprefixer: '^10.4.0',
  postcss: '^8.4.0',
};

const DEV_DEPS = {
  typescript: '^5.8.0',
  vite: '^5.4.0',
  '@vitejs/plugin-react': '^4.3.0',
  vitest: '^2.1.0',
  '@testing-library/react': '^16.1.0',
  '@testing-library/jest-dom': '^6.6.0',
  '@playwright/test': '^1.49.0',
  '@types/react': '^18.3.0',
  '@types/react-dom': '^18.3.0',
};

function createDir(base, ...parts) {
  const dir = join(base, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(base, filePath, content) {
  writeFileSync(join(base, filePath), content.trimStart(), 'utf8');
}

function scaffold(name, options = {}) {
  const root = join(process.cwd(), name);

  if (existsSync(root)) {
    console.error(`Error: directory "${name}" already exists.`);
    process.exit(1);
  }

  console.log(`\nCreating EHG venture: ${name}`);
  console.log('═'.repeat(50));

  // Create directory structure
  mkdirSync(root, { recursive: true });
  createDir(root, 'src', 'components', 'ui');
  createDir(root, 'src', 'hooks');
  createDir(root, 'src', 'lib');
  createDir(root, 'src', 'pages');
  createDir(root, 'src', 'routes');
  createDir(root, 'src', 'stores');
  createDir(root, 'config');
  createDir(root, 'public');
  createDir(root, 'supabase', 'migrations');
  createDir(root, 'tests', 'unit');
  createDir(root, 'tests', 'e2e');
  console.log('  ✓ Directory structure created');

  // package.json
  const pkg = {
    name,
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
      'test:unit': 'vitest run',
      'test:e2e': 'playwright test',
      'test:all': 'vitest run && playwright test',
      lint: 'eslint .',
      'type-check': 'tsc --noEmit',
    },
    dependencies: PACKAGE_VERSIONS,
    devDependencies: DEV_DEPS,
  };
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  console.log('  ✓ package.json');

  // tsconfig.json
  writeFile(root, 'tsconfig.json', `
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
`);
  console.log('  ✓ tsconfig.json');

  // vite.config.ts
  writeFile(root, 'vite.config.ts', `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  server: { port: 8080 },
});
`);
  console.log('  ✓ vite.config.ts');

  // tailwind.config.ts
  writeFile(root, 'tailwind.config.ts', `
import type { Config } from 'tailwindcss';
// import ehgPreset from '@ehg/tailwind-preset';

const config: Config = {
  // presets: [ehgPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
`);
  console.log('  ✓ tailwind.config.ts');

  // postcss.config.js
  writeFile(root, 'postcss.config.js', `
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

  // index.html
  writeFile(root, 'index.html', `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);
  console.log('  ✓ index.html');

  // src/main.tsx
  writeFile(root, 'src/main.tsx', `
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
`);

  // src/App.tsx
  writeFile(root, 'src/App.tsx', `
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
`);

  // src/pages/HomePage.tsx
  writeFile(root, 'src/pages/HomePage.tsx', `
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Welcome to ${name}</h1>
        <p className="mt-4 text-muted-foreground">Built with the EHG Venture Stack</p>
      </div>
    </main>
  );
}
`);

  // src/index.css
  writeFile(root, 'src/index.css', `
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 215 25% 15%;
    --primary: 217 91% 50%;
    --primary-foreground: 0 0% 100%;
    --muted: 210 40% 98%;
    --muted-foreground: 215 20% 40%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 217 91% 50%;
    --radius: 0.75rem;
  }
  .dark {
    --background: 215 25% 8%;
    --foreground: 0 0% 98%;
    --primary: 220 100% 70%;
    --primary-foreground: 215 25% 8%;
    --muted: 215 25% 12%;
    --muted-foreground: 215 20% 65%;
    --border: 215 25% 15%;
    --input: 215 25% 15%;
    --ring: 220 100% 70%;
  }
}
`);

  // src/lib/supabase.ts
  writeFile(root, 'src/lib/supabase.ts', `
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`);

  // src/stores/appStore.ts
  writeFile(root, 'src/stores/appStore.ts', `
import { create } from 'zustand';

interface AppState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'light',
  toggleTheme: () => set((state) => ({
    theme: state.theme === 'light' ? 'dark' : 'light',
  })),
}));
`);

  // .env.example
  writeFile(root, '.env.example', `
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
`);

  // .gitignore
  writeFile(root, '.gitignore', `
node_modules
dist
.env
.env.local
coverage
test-results
playwright-report
*.tsbuildinfo
`);

  // tests/unit/App.test.tsx
  writeFile(root, 'tests/unit/App.test.tsx', `
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../src/App';

describe('App', () => {
  it('renders welcome message', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText(/Welcome to/i)).toBeDefined();
  });
});
`);

  console.log('  ✓ Source files, stores, tests');

  // vitest.config.ts
  writeFile(root, 'vitest.config.ts', `
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
`);

  // playwright.config.ts
  writeFile(root, 'playwright.config.ts', `
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
`);

  console.log('  ✓ Test config (Vitest + Playwright)');

  // Install dependencies
  if (!options.skipInstall) {
    console.log('\n  Installing dependencies...');
    try {
      execSync('npm install', { cwd: root, stdio: 'inherit' });
      console.log('  ✓ Dependencies installed');
    } catch {
      console.log('  ⚠ npm install failed. Run "npm install" manually.');
    }
  } else {
    console.log('  ⚠ Skipping npm install (--skip-install)');
  }

  console.log('\n═'.repeat(50));
  console.log(`\n✅ Venture "${name}" created successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  cp .env.example .env    # Configure Supabase`);
  console.log(`  npm run dev             # Start development server`);
  console.log(`  npm run test:unit       # Run unit tests`);
  console.log(`\nConformance check:`);
  console.log(`  node ../scripts/venture-conformance-check.js .`);
  console.log('');
}

// CLI entry point
const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const skipInstall = args.includes('--skip-install');

if (!name) {
  console.log('Usage: npx create-ehg-venture <venture-name> [--skip-install]');
  process.exit(1);
}

scaffold(name, { skipInstall });
