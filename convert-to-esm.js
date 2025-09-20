#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const servicesDir = path.join(__dirname, 'src', 'services');

const filesToConvert = [
  'status-validator.js',
  'realtime-manager.js',
  'refresh-api.js',
  'version-detector.js',
  'realtime-dashboard.js'
];

filesToConvert.forEach(file => {
  const filePath = path.join(servicesDir, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${file}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Convert require statements to import
  content = content
    // Handle require statements with destructuring
    .replace(/const\s+\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g, "import { $1 } from '$2';")
    // Handle regular require statements
    .replace(/const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, "import $1 from '$2';")
    // Handle dotenv config
    .replace(/require\(['"]dotenv['"]\)\.config\(\);?/g, "import dotenv from 'dotenv';\ndotenv.config();")
    // Fix relative imports - add .js extension
    .replace(/from\s+['"]\.\//g, "from './")
    .replace(/from\s+['"]\.\.\/([^'"]+)(?<!\.js)['"]/g, "from '../$1.js'")
    .replace(/from\s+['"]\.\/([^'"]+)(?<!\.js)['"]/g, "from './$1.js'");
  
  // Convert module.exports to export default
  content = content.replace(/module\.exports\s*=\s*(\w+);?/g, "export default $1;");
  
  // Add __dirname if needed
  if (content.includes('__dirname') && !content.includes('const __dirname')) {
    const importSection = `import { fileURLToPath } from 'url';\n\nconst __filename = fileURLToPath(import.meta.url);\nconst __dirname = path.dirname(__filename);\n`;
    
    // Insert after imports
    const importEndMatch = content.match(/(import[^;]+;\n)+/);
    if (importEndMatch) {
      const insertPos = importEndMatch.index + importEndMatch[0].length;
      content = content.slice(0, insertPos) + importSection + content.slice(insertPos);
    }
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ Converted ${file} to ES module`);
});

console.log('\n✨ Conversion complete!');