#!/usr/bin/env node

/**
 * Script to identify and document all navigation issues in the LEO Protocol Dashboard
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Analyzing LEO Protocol Dashboard Navigation Issues\n');
console.log('=' .repeat(50));

const issues = [];

// Issue 1: SD Dropdown Navigation
issues.push({
  id: 'NAV-001',
  severity: 'CRITICAL',
  component: 'ActiveSDProgress',
  file: 'client/src/components/ActiveSDProgress.jsx',
  line: 289,
  description: 'SD dropdown selection causes blank screen',
  cause: 'onSetActiveSD changes state but no route exists for individual SD view',
  currentCode: `onClick={() => {
    if (onSetActiveSD) onSetActiveSD(sd.id);
    setIsDropdownOpen(false);
  }}`,
  fix: `onClick={() => {
    // Don't change route, just update active SD in current view
    if (onSetActiveSD) onSetActiveSD(sd.id);
    setIsDropdownOpen(false);
    // Optionally scroll to SD in list or show detail modal
  }}`
});

// Issue 2: Missing Individual SD Routes
issues.push({
  id: 'NAV-002',
  severity: 'HIGH',
  component: 'App',
  file: 'client/src/App.jsx',
  line: 184,
  description: 'No route defined for individual SD details',
  cause: 'Route path="strategic-directives/:id" is missing',
  currentCode: `<Route 
    path="strategic-directives" 
    element={<SDManager ... />} 
  />`,
  fix: `<Route path="strategic-directives">
    <Route index element={<SDManager ... />} />
    <Route path=":id" element={<SDDetail ... />} />
  </Route>`
});

// Issue 3: PRD Navigation
issues.push({
  id: 'NAV-003',
  severity: 'MEDIUM',
  component: 'PRDManager',
  file: 'client/src/components/PRDManager.jsx',
  description: 'No individual PRD view route',
  cause: 'Similar to SD issue - no route for PRD details',
  fix: 'Add PRD detail route or use modal for details'
});

// Issue 4: Back Navigation
issues.push({
  id: 'NAV-004',
  severity: 'LOW',
  component: 'SDManager',
  file: 'client/src/components/SDManager.jsx',
  line: 44,
  description: 'Back button in detail view uses state instead of router',
  cause: 'Using component state for view mode instead of React Router',
  currentCode: `onClick={() => setViewMode('list')}`,
  fix: `onClick={() => navigate('/strategic-directives')}`
});

// Issue 5: Direct URL Access
issues.push({
  id: 'NAV-005',
  severity: 'MEDIUM',
  component: 'Router',
  description: 'Direct URL access to /strategic-directives/SD-123 shows blank',
  cause: 'No catch-all route or 404 handling',
  fix: 'Add wildcard route with redirect to overview'
});

// Generate report
console.log('\n📋 NAVIGATION ISSUES IDENTIFIED\n');

const critical = issues.filter(i => i.severity === 'CRITICAL');
const high = issues.filter(i => i.severity === 'HIGH');
const medium = issues.filter(i => i.severity === 'MEDIUM');
const low = issues.filter(i => i.severity === 'LOW');

console.log(`Found ${issues.length} navigation issues:`);
console.log(`  🔴 Critical: ${critical.length}`);
console.log(`  🟠 High: ${high.length}`);
console.log(`  🟡 Medium: ${medium.length}`);
console.log(`  🟢 Low: ${low.length}`);

console.log('\n🔴 CRITICAL ISSUES (Fix immediately):\n');
critical.forEach(issue => {
  console.log(`[${issue.id}] ${issue.component}`);
  console.log(`  Issue: ${issue.description}`);
  console.log(`  Cause: ${issue.cause}`);
  console.log(`  File: ${issue.file}${issue.line ? ':' + issue.line : ''}`);
  console.log('');
});

console.log('\n🛠️  RECOMMENDED FIXES:\n');

console.log('1. IMMEDIATE FIX for SD Dropdown (prevents blank screen):');
console.log('   - Modify ActiveSDProgress to NOT navigate on selection');
console.log('   - Instead, update the current view to show selected SD');
console.log('   - Or open SD in a modal instead of navigating');

console.log('\n2. ADD PROPER ROUTING:');
console.log('   - Add nested routes for SD and PRD details');
console.log('   - Add 404/fallback route');
console.log('   - Use React Router useNavigate hook');

console.log('\n3. IMPLEMENT NAVIGATION GUARDS:');
console.log('   - Check if SD/PRD exists before navigating');
console.log('   - Show loading state during navigation');
console.log('   - Handle navigation errors gracefully');

console.log('\n📝 PROPOSED SOLUTION:\n');

const solution = `
// 1. Update App.jsx routing structure:
<Routes>
  <Route path="/" element={<AnimatedAppLayout ... />}>
    <Route index element={<EnhancedOverview ... />} />
    
    {/* Strategic Directives with nested routes */}
    <Route path="strategic-directives">
      <Route index element={<SDManager ... />} />
      <Route path=":id" element={<SDDetail ... />} />
    </Route>
    
    {/* PRDs with nested routes */}
    <Route path="prds">
      <Route index element={<PRDManager ... />} />
      <Route path=":id" element={<PRDDetail ... />} />
    </Route>
    
    {/* Other routes */}
    <Route path="handoffs" element={<HandoffCenter ... />} />
    <Route path="context" element={<ContextMonitor ... />} />
    <Route path="progress" element={<ProgressTracker ... />} />
    
    {/* 404 fallback */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>
</Routes>

// 2. Fix ActiveSDProgress dropdown:
const handleSDSelect = (sdId) => {
  // Update active SD without navigation
  onSetActiveSD(sdId);
  setIsDropdownOpen(false);
  
  // Optional: Emit event for other components
  window.dispatchEvent(new CustomEvent('sdChanged', { detail: sdId }));
};

// 3. Add SDDetail component for individual SD view:
function SDDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sd, setSd] = useState(null);
  
  useEffect(() => {
    fetch(\`/api/sd/\${id}\`)
      .then(res => res.json())
      .then(setSd)
      .catch(() => navigate('/strategic-directives'));
  }, [id]);
  
  if (!sd) return <LoadingSkeleton />;
  
  return (
    <div className="p-6">
      <button onClick={() => navigate('/strategic-directives')}>
        Back to List
      </button>
      {/* SD detail content */}
    </div>
  );
}
`;

console.log(solution);

console.log('\n✅ BENEFITS OF FIX:');
console.log('  • No more blank screens when selecting SD');
console.log('  • Proper browser history and back button support');
console.log('  • Direct URL access works correctly');
console.log('  • Better SEO and shareability');
console.log('  • Consistent navigation patterns');

console.log('\n' + '=' .repeat(50));
console.log('Analysis complete. Fixes should be implemented immediately.');
console.log('Priority: Fix SD dropdown first to prevent blank screens.');