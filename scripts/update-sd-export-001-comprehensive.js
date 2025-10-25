#!/usr/bin/env node

/**
 * Update SD-EXPORT-001 with comprehensive analytics export UI strategy
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDEXPORT001() {
  console.log('📋 Updating SD-EXPORT-001 with comprehensive export UI strategy...\n');

  const updatedSD = {
    description: `Create comprehensive UI for fully-built Analytics Export Engine (608 LOC, 20KB) supporting PDF, Excel, CSV, and JSON exports with scheduling capabilities. Current: Engine complete with 4 export formats, report generation, scheduling logic, database integration, BUT 0 UI imports and TODO comment in ChairmanDashboard.tsx line 189-194 ('Export Report' button does nothing).

**CURRENT STATE - EXPORT ENGINE DORMANT**:
- ✅ AnalyticsExportEngine: 608 LOC, 20KB complete implementation
- ✅ 4 export formats: PDF (HTML template with charts), Excel (multi-sheet workbooks), CSV (data grid), JSON (API export)
- ✅ 5 report types: venture_analytics, portfolio_summary, performance_report, financial_analysis, custom_report
- ✅ Scheduling system: Daily, weekly, monthly, quarterly recurring exports with calculateNextExport()
- ✅ Database schema: analytics_exports table for tracking exports, status, scheduling
- ✅ Report data gathering: getVentureMetrics(), getPortfolioMetrics(), getPerformanceMetrics(), getFinancialMetrics()
- ✅ Insights generation: generateVentureInsights(), generatePortfolioInsights(), recommendations
- ✅ Export history: getExportHistory() fetches last 20 exports per venture
- ✅ 24-hour expiry: EXPORT_EXPIRY_HOURS = 24, auto-calculated expiration
- ❌ ZERO UI integration: Only 2 references (export-engine.ts itself + definition), no component imports
- ❌ TODO button: ChairmanDashboard.tsx:189-194 - 'Export Report' button with TODO comment, no onClick handler
- ❌ No configuration dialog: Users cannot select format, date range, metrics
- ❌ No scheduling interface: Recurring exports not accessible
- ❌ No export history UI: Cannot view past exports or download files
- ❌ No download manager: Generated exports have no UI access

**EXPORT ENGINE ANALYSIS (608 LOC, 20KB)**:

**Core API**:
- createExport(config): Main entry point - validates config, saves to database, generates export, returns ExportResult
- ExportConfiguration interface: ventureId, exportType (5 types), format (4 formats), dateRange, metrics, filters, customization (title, description, branding, charts), scheduled (boolean), frequency
- ExportResult interface: exportId, status (processing/completed/failed), downloadUrl, fileSize, generatedAt, expiresAt, metadata

**Export Formats (Lines 224-312)**:
1. PDF (generatePDFExport): HTML template with CSS styling, metrics in cards, insights/recommendations sections, ready for Puppeteer/jsPDF
2. Excel (generateExcelExport): Multi-sheet structure - summary sheet, metrics sheet, insights sheet, recommendations sheet (getExcelSheetCount returns 1-4 sheets)
3. CSV (generateCSVExport): Simple data grid - headers: Metric Name, Value, Unit, Trend, Previous Value - rows from metrics array
4. JSON (generateJSONExport): Full structured data - title, description, dateRange, venture, metrics, insights, recommendations

**Report Types & Data Gathering (Lines 160-222)**:
1. venture_analytics: getVentureMetrics() - Revenue, CAC, MAU, Conversion Rate with trends
2. portfolio_summary: getPortfolioMetrics() - Total Portfolio Value, Active Ventures, Average ROI
3. performance_report: getPerformanceMetrics() - Execution Score, Time to Market, Quality Score
4. financial_analysis: getFinancialMetrics() - Burn Rate, Runway, Revenue Growth
5. custom_report: getCustomMetrics() - User-defined metrics from config.configuration.metrics array

**Insights & Recommendations (Lines 487-522)**:
- generateVentureInsights(): "Revenue growth shows strong upward trend", "Customer acquisition costs improved by 10.5%"
- generatePortfolioInsights(): "Portfolio performance exceeded benchmark by 12%"
- generatePerformanceRecommendations(): "Continue current execution strategy", "Consider accelerating go-to-market"
- generateFinancialInsights(): "Burn rate optimization efforts showing positive results"

**Scheduling System (Lines 551-565)**:
- calculateNextExport(frequency): Daily (+1 day), Weekly (+7 days), Monthly (+1 month), Quarterly (+3 months)
- Stores next_export timestamp in database
- scheduled flag in configuration enables recurring exports

**Database Integration**:
- Table: analytics_exports (venture_id, export_type, format, configuration, scheduled, frequency, status, last_exported, next_export)
- Insert: On createExport() with status='processing'
- Update: After generation with status='completed'/'failed', last_exported, next_export timestamps
- Query: getExportHistory() fetches last 20 exports ordered by created_at DESC

**CHAIRMAN DASHBOARD TODO (ChairmanDashboard.tsx:189-194)**:
\`\`\`tsx
{/* TODO (SD-UAT-003): Implement Export Report functionality
    Should export dashboard data as PDF/Excel with charts and metrics
    Estimated effort: 2-3 hours */}
<Button variant="outline" size="sm" aria-label="Export dashboard report">
  <Download className="w-4 h-4 mr-2" aria-hidden="true" />
  Export Report
</Button>
\`\`\`

**GAPS IDENTIFIED**:
1. **No UI Access**: 0 components import analyticsExportEngine, TODO button does nothing
2. **No Configuration Dialog**: Cannot select format (PDF/Excel/CSV/JSON), date range, metrics, customization
3. **No Scheduling Interface**: Recurring exports (daily/weekly/monthly/quarterly) not accessible via UI
4. **No Export History**: getExportHistory() exists but no component displays past exports
5. **No Download Manager**: ExportResult has downloadUrl, but no UI to access files
6. **No Preview**: Cannot preview report before generation
7. **No Progress Tracking**: Status (processing/completed/failed) not visible to users
8. **No Format Guidance**: Users don't know when to use PDF vs Excel vs CSV vs JSON`,

    scope: `**6-Week Export UI Implementation**:

**PHASE 1: Core Export Dialog (Weeks 1-2)**
- Create ExportConfigDialog component (modal)
- Build format selector: Radio buttons for PDF, Excel, CSV, JSON with icons
- Add date range picker: Start date, end date
- Add metrics selector: Multi-select checkbox list
- Connect to ChairmanDashboard 'Export Report' button

**PHASE 2: Export Preview & Generation (Week 3)**
- Build ExportPreview component: Shows report structure before generation
- Add customization panel: Title, description, branding toggle, charts toggle
- Implement export generation: Call analyticsExportEngine.createExport()
- Add progress indicator: Processing status, completion notification

**PHASE 3: Export History & Downloads (Week 4)**
- Create ExportHistory component: Table of past exports
- Add download buttons: Click to download file from downloadUrl
- Show export metadata: Format, generated date, file size, expiration
- Add delete/archive functionality

**PHASE 4: Scheduling Interface (Week 5)**
- Build ExportScheduler component: Configure recurring exports
- Add frequency selector: Daily, weekly, monthly, quarterly
- Show scheduled exports list: Next run date, edit/delete options
- Add notification preferences: Email on export completion

**PHASE 5: Integration & Polish (Week 6)**
- Integrate with other dashboards: Analytics, Portfolio, Financial
- Add export templates: Pre-configured report types
- Add bulk export: Export multiple ventures at once
- Polish UI: Loading states, error handling, success toasts

**OUT OF SCOPE**:
- ❌ Custom chart generation (use existing charts)
- ❌ Real PDF rendering (Puppeteer integration - separate SD)
- ❌ Email delivery (notification system - separate SD)
- ❌ Export sharing/permissions (governance - separate SD)`,

    strategic_objectives: [
      "Build ExportConfigDialog component connecting ChairmanDashboard 'Export Report' button to analyticsExportEngine.createExport(), enabling PDF/Excel/CSV/JSON exports",
      'Create comprehensive configuration UI: Format selector (4 options), date range picker, metrics multi-select, customization panel (title, description, branding, charts)',
      'Implement export preview: Show report structure before generation, prevent surprises, allow edits before committing',
      'Build ExportHistory component displaying last 20 exports via getExportHistory(), showing format, generated date, file size, download buttons',
      'Create ExportScheduler interface for recurring exports: Frequency selector (daily/weekly/monthly/quarterly), scheduled exports list, next run dates',
      'Integrate with 3+ dashboards: ChairmanDashboard (venture_analytics), Portfolio (portfolio_summary), Financial (financial_analysis)',
      'Achieve 80%+ export usage: Target 80% of users export ≥1 report within first month, demonstrating value of exposed export capability',
      'Enable self-service reporting: Users generate custom reports without developer intervention, reducing manual reporting workload by 70%'
    ],

    success_criteria: [
      "✅ ExportConfigDialog operational: Modal opens from 'Export Report' button, format/date/metrics selectable, generates export",
      '✅ Export engine integration: analyticsExportEngine imported in ≥3 components (ChairmanDashboard, ExportConfigDialog, ExportHistory)',
      '✅ 4 formats accessible: PDF, Excel, CSV, JSON all selectable and generate correctly',
      '✅ Export preview works: Shows report structure, metrics list, insights preview before generation',
      '✅ Export history displays: Table shows last 20 exports, download buttons work, metadata visible (format, size, date)',
      '✅ Scheduling interface functional: Can create daily/weekly/monthly/quarterly recurring exports, view scheduled list, edit/delete',
      '✅ Multi-dashboard integration: Export buttons in ChairmanDashboard, Analytics, Portfolio, Financial dashboards',
      '✅ TODO removed: ChairmanDashboard.tsx:189-194 TODO comment deleted, button has real onClick handler',
      '✅ User adoption: ≥80% of users export ≥1 report within 30 days, ≥50% use scheduling feature',
      '✅ Performance: Export generation <5 seconds (p95), dialog load <1 second, history fetch <500ms',
      '✅ Download success rate: ≥95% of exports successfully download, <5% expired before download',
      '✅ Self-service reporting: ≥70% reduction in manual reporting requests, users generate own reports'
    ],

    key_principles: [
      "**Connect, Don't Rebuild**: 608 LOC export engine complete - build UI layer only, no changes to export-engine.ts",
      '**Format Guidance**: Show when to use each format - PDF (executive reports), Excel (data analysis), CSV (raw data), JSON (API integration)',
      '**Preview First**: Always show report structure before generation - prevent wasted exports, allow customization',
      '**History Transparency**: Show all past exports - users need to see what was generated, when, and how to access',
      '**Scheduling Simplicity**: Recurring exports should be 3 clicks - frequency selector, metrics, done - no complex workflows',
      '**Expiry Awareness**: Show expiration dates prominently - 24-hour expiry means users must download quickly or regenerate',
      '**Progressive Disclosure**: Quick export (1-click with defaults) for simple needs, advanced options (customization, scheduling) behind toggles',
      "**Integration First**: Export buttons in ALL dashboards - don't force users to navigate to special export page"
    ],

    implementation_guidelines: [
      '**PHASE 1: Export Dialog (Weeks 1-2)**',
      '',
      '1. Create ExportConfigDialog.tsx component:',
      "   - Import: import { analyticsExportEngine } from '@/lib/analytics/export-engine';",
      '   - Props: isOpen, onClose, ventureId, reportType (pre-filled based on dashboard)',
      "   - State: const [format, setFormat] = useState<'pdf' | 'excel' | 'csv' | 'json'>('pdf');",
      "   - State: const [dateRange, setDateRange] = useState({ start: '', end: '' });",
      '   - State: const [metrics, setMetrics] = useState<string[]>([]);',
      '',
      '2. Build format selector (Lines 77-99 of Dialog):',
      '   - Radio buttons with icons: PDF (FileText), Excel (Table), CSV (List), JSON (Code)',
      "   - Show descriptions: 'PDF: Executive reports with charts', 'Excel: Multi-sheet analysis workbook'",
      '   - Default to PDF for executive reports, Excel for data analysis',
      '',
      '3. Add date range picker:',
      '   - Use Shadcn DateRangePicker component (if exists) or build with Popover + Calendar',
      '   - Defaults: Last 30 days (common use case)',
      '   - Validation: End date must be after start date',
      '',
      '4. Build metrics selector:',
      '   - Checkbox list based on reportType:',
      "   - venture_analytics: ['Revenue', 'CAC', 'MAU', 'Conversion Rate', 'Churn Rate', 'LTV']",
      "   - portfolio_summary: ['Total Portfolio Value', 'Active Ventures', 'ROI', 'Risk Score']",
      "   - performance_report: ['Execution Score', 'Time to Market', 'Quality Score']",
      '   - Select All / Deselect All buttons',
      '',
      '5. Connect to ChairmanDashboard button:',
      '   - Update ChairmanDashboard.tsx line 192:',
      '   - Before: <Button variant="outline" size="sm" aria-label="Export dashboard report">',
      '   - After: <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>',
      '   - Add state: const [exportDialogOpen, setExportDialogOpen] = useState(false);',
      '   - Remove TODO comment (lines 189-191)',
      '',
      '**PHASE 2: Preview & Generation (Week 3)**',
      '',
      '6. Build ExportPreview component:',
      '   - Shows: Report title, description, date range, metrics list (with icons), insights preview (first 2-3)',
      "   - Layout: Card with sections - 'Report Overview', 'Metrics (5)', 'Insights (3)', 'File: venture_analytics_2025-10-02.pdf'",
      '   - Edit button: Return to configuration to adjust',
      '',
      '7. Add customization panel (collapsible section in ExportConfigDialog):',
      "   - Input: Custom title (default: 'Venture Analytics Report')",
      "   - Textarea: Custom description (default: 'Comprehensive venture analytics analysis...')",
      '   - Checkbox: Include branding (company logo, colors)',
      '   - Checkbox: Include charts (if false, metrics table only)',
      '   - Checkbox: Include trends (show previous values, trend arrows)',
      '',
      '8. Implement export generation:',
      '   - Handler: const handleGenerateExport = async () => {',
      '   -   setGenerating(true);',
      '   -   const config: ExportConfiguration = {',
      '   -     ventureId,',
      "   -     exportType: 'venture_analytics',",
      '   -     format,',
      '   -     configuration: { dateRange, metrics, customization: { title, description, branding, charts } }',
      '   -   };',
      '   -   const result = await analyticsExportEngine.createExport(config);',
      "   -   if (result.status === 'completed') toast.success('Export ready! Check history to download');",
      '   -   setGenerating(false);',
      '   - }',
      '',
      '**PHASE 3: History & Downloads (Week 4)**',
      '',
      '9. Create ExportHistory.tsx component:',
      "   - Import: import { analyticsExportEngine } from '@/lib/analytics/export-engine';",
      '   - Fetch: const history = await analyticsExportEngine.getExportHistory(ventureId);',
      '   - Table columns: Format (badge), Report Type, Generated Date, File Size, Expires At, Status, Actions',
      "   - Actions: Download button (if status='completed' and not expired), Delete button",
      '',
      '10. Implement download handler:',
      '     - Handler: const handleDownload = (exportResult: ExportResult) => {',
      '     -   if (exportResult.downloadUrl) {',
      "     -     window.open(exportResult.downloadUrl, '_blank');",
      '     -   }',
      '     - }',
      '     - Note: In production, downloadUrl would point to cloud storage (S3, Supabase Storage)',
      '',
      '11. Add metadata display:',
      "     - Format badge: <Badge variant={format === 'pdf' ? 'default' : 'secondary'}>{format.toUpperCase()}</Badge>",
      "     - File size: Format as KB/MB: (fileSize / 1024).toFixed(1) + ' KB'",
      "     - Expiration warning: If expiresAt < now + 1 hour, show orange badge 'Expires soon'",
      '',
      '**PHASE 4: Scheduling (Week 5)**',
      '',
      '12. Build ExportScheduler.tsx component:',
      '     - Form: Report Type dropdown, Format dropdown, Metrics multi-select, Frequency dropdown (Daily/Weekly/Monthly/Quarterly)',
      '     - Handler: const handleScheduleExport = async () => {',
      '     -   const config: ExportConfiguration = { ..., scheduled: true, frequency: selectedFrequency };',
      '     -   await analyticsExportEngine.createExport(config);',
      "     -   toast.success('Export scheduled!');",
      '     - }',
      '',
      '13. Show scheduled exports list:',
      '     - Query: SELECT * FROM analytics_exports WHERE scheduled=true AND venture_id=? ORDER BY next_export ASC',
      '     - Table: Report Type, Format, Frequency, Next Run, Last Run, Status, Actions (Edit, Pause, Delete)',
      "     - Next Run: Display as 'Tomorrow at 8:00 AM' or 'In 2 days' (relative time)",
      '',
      '14. Add pause/resume functionality:',
      "     - Button: 'Pause' or 'Resume' based on current status",
      "     - Handler: Update status field in database: 'paused' or 'active'",
      '     - Visual indicator: Gray out row if paused',
      '',
      '**PHASE 5: Integration (Week 6)**',
      '',
      '15. Integrate with Analytics dashboard:',
      "     - Add 'Export Analytics' button to AnalyticsDashboard component",
      "     - Pre-fill: reportType='venture_analytics', metrics from current dashboard view",
      '',
      '16. Integrate with Portfolio dashboard:',
      "     - Add 'Export Portfolio' button",
      "     - Pre-fill: reportType='portfolio_summary', metrics='all portfolio metrics'",
      '',
      '17. Integrate with Financial dashboard:',
      "     - Add 'Export Financial Report' button",
      "     - Pre-fill: reportType='financial_analysis', metrics=['Burn Rate', 'Runway', 'Revenue Growth']",
      '',
      '18. Add export templates:',
      '     - Create ExportTemplates.tsx: Pre-configured exports',
      "     - Templates: 'Executive Summary (PDF)', 'Data Analysis (Excel)', 'API Export (JSON)', 'Quick CSV'",
      '     - Handler: Clicking template pre-fills ExportConfigDialog with template settings',
      '',
      '19. Add bulk export:',
      "     - In Portfolio dashboard, add 'Export All Ventures' button",
      '     - Handler: Loop through ventures, create export for each, show progress bar',
      '     - Result: ZIP file with all exports or separate downloads'
    ],

    risks: [
      {
        risk: 'Export generation takes >10 seconds: Large reports with many metrics, complex charts cause slow generation, users abandon',
        probability: 'Medium (50%)',
        impact: 'Medium - Poor UX, reduced adoption',
        mitigation: 'Async generation with background processing, show progress indicator, send notification when complete, cache common reports'
      },
      {
        risk: '24-hour expiry too short: Users generate exports but download days later, links expired, frustration and re-generation needed',
        probability: 'High (60%)',
        impact: 'Medium - Poor UX, wasted resources',
        mitigation: 'Show expiration prominently, send reminder email before expiry, allow re-generation with 1 click, consider extending to 72 hours'
      },
      {
        risk: "PDF rendering quality issues: Charts don't render, formatting broken, unprofessional appearance damages trust",
        probability: 'Medium (40%)',
        impact: 'High - Users stop using PDF exports, prefer manual screenshots',
        mitigation: 'Use proven PDF library (Puppeteer or jsPDF), extensive testing with various report sizes, provide export preview, fallback to HTML if PDF fails'
      },
      {
        risk: 'Scheduling overwhelms system: Many users schedule daily exports, database fills with old exports, performance degrades',
        probability: 'Low (30%)',
        impact: 'Medium - System slowdown, storage costs',
        mitigation: 'Auto-delete exports after expiry, limit max scheduled exports per user (e.g., 5), add cleanup cron job, paginate history'
      }
    ],

    success_metrics: [
      {
        metric: 'Export engine integration',
        target: '≥3 components import analyticsExportEngine, TODO comment removed from ChairmanDashboard',
        measurement: "grep -r 'analyticsExportEngine' src --include='*.tsx' | wc -l (expect ≥3)"
      },
      {
        metric: 'Export generation rate',
        target: '≥80% of users generate ≥1 export within 30 days',
        measurement: "SELECT COUNT(DISTINCT venture_id) FROM analytics_exports WHERE created_at > NOW() - INTERVAL '30 days'"
      },
      {
        metric: 'Format distribution',
        target: 'PDF (50%), Excel (30%), CSV (15%), JSON (5%) - validates format usage',
        measurement: 'SELECT format, COUNT(*) FROM analytics_exports GROUP BY format'
      },
      {
        metric: 'Scheduling adoption',
        target: '≥50% of active users create ≥1 scheduled export',
        measurement: 'SELECT COUNT(DISTINCT venture_id) FROM analytics_exports WHERE scheduled=true'
      },
      {
        metric: 'Download success rate',
        target: '≥95% of exports downloaded before expiry',
        measurement: "Track 'export_downloaded' event, compare to 'export_created' count"
      },
      {
        metric: 'Self-service reporting reduction',
        target: "≥70% reduction in manual reporting requests (measure support tickets tagged 'report request')",
        measurement: 'Compare support tickets pre/post launch'
      }
    ],

    metadata: {
      'export_engine': {
        'file': 'src/lib/analytics/export-engine.ts',
        'loc': 608,
        'size': '20KB',
        'formats': ['PDF', 'Excel', 'CSV', 'JSON'],
        'report_types': ['venture_analytics', 'portfolio_summary', 'performance_report', 'financial_analysis', 'custom_report'],
        'current_imports': 2
      },
      'integration_points': {
        'ChairmanDashboard': 'Line 189-194 TODO button',
        'Analytics': 'Add export button',
        'Portfolio': 'Add export button',
        'Financial': 'Add export button'
      },
      'implementation_plan': {
        'phase_1': 'Export dialog (Weeks 1-2)',
        'phase_2': 'Preview & generation (Week 3)',
        'phase_3': 'History & downloads (Week 4)',
        'phase_4': 'Scheduling (Week 5)',
        'phase_5': 'Integration (Week 6)'
      },
      'business_value': 'HIGH - Executive reporting, compliance, data portability, self-service analytics',
      'prd_readiness': {
        'scope_clarity': '95%',
        'execution_readiness': '90%',
        'risk_coverage': '85%',
        'business_impact': '90%'
      }
    }
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('id', 'SD-EXPORT-001');

  if (error) {
    console.error('❌ Error updating SD-EXPORT-001:', error);
    process.exit(1);
  }

  console.log('✅ SD-EXPORT-001 updated successfully!\n');
  console.log('📊 Summary: 6-week analytics export UI implementation');
  console.log('  ✓ Build ExportConfigDialog: Format, date range, metrics selection');
  console.log('  ✓ Create export preview & generation (4 formats: PDF, Excel, CSV, JSON)');
  console.log('  ✓ Implement ExportHistory with download manager');
  console.log('  ✓ Build ExportScheduler: Daily/weekly/monthly/quarterly recurring exports');
  console.log('  ✓ Connect ChairmanDashboard TODO button to real export engine\n');
  console.log('✨ SD-EXPORT-001 enhancement complete!');
}

updateSDEXPORT001();
