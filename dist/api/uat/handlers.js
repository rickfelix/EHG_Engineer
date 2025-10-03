/**
 * UAT Handler Utilities
 * TypeScript server-side functions for UAT result processing
 */
import { createClient } from '@supabase/supabase-js';
// Initialize Supabase client
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
/**
 * Start a new UAT run
 */
export async function startUATRun(env_url, app_version, browser, role, notes) {
    try {
        const { data, error } = await supabase
            .from('uat_runs')
            .insert({
            app: 'EHG',
            env_url,
            app_version,
            browser,
            role,
            notes
        })
            .select('id')
            .single();
        if (error)
            throw error;
        return { run_id: data.id };
    }
    catch (err) {
        console.error('Error starting UAT run:', err);
        return { run_id: '', error: String(err) };
    }
}
/**
 * Upsert a UAT result atomically
 */
export async function upsertUATResult(result) {
    try {
        // Use the RPC function for atomic upsert
        const { data, error } = await supabase.rpc('upsert_uat_result', {
            p_run_id: result.run_id,
            p_case_id: result.case_id,
            p_status: result.status,
            p_evidence_url: result.evidence_url || null,
            p_evidence_heading: result.evidence_heading || null,
            p_evidence_toast: result.evidence_toast || null,
            p_notes: result.notes || null
        });
        if (error)
            throw error;
        return {
            success: true,
            stats: data.stats
        };
    }
    catch (err) {
        console.error('Error upserting UAT result:', err);
        return {
            success: false,
            error: String(err)
        };
    }
}
/**
 * Create a defect with intelligent file detection
 */
export async function createUATDefect(defect) {
    try {
        // Analyze the case ID to infer suspected files
        const suspectedFiles = defect.suspected_files || inferSuspectedFiles(defect.case_id);
        // Use the RPC function for defect creation
        const { data, error } = await supabase.rpc('create_uat_defect', {
            p_run_id: defect.run_id,
            p_case_id: defect.case_id,
            p_severity: defect.severity,
            p_summary: defect.summary || null,
            p_suspected_files: JSON.stringify(suspectedFiles)
        });
        if (error)
            throw error;
        return { defect_id: data };
    }
    catch (err) {
        console.error('Error creating UAT defect:', err);
        return { error: String(err) };
    }
}
/**
 * Get run statistics and gate status
 */
export async function getRunStats(run_id) {
    try {
        const { data, error } = await supabase
            .from('v_uat_run_stats')
            .select('*')
            .eq('run_id', run_id)
            .single();
        if (error)
            throw error;
        return data;
    }
    catch (err) {
        console.error('Error getting run stats:', err);
        return null;
    }
}
/**
 * Get next test to execute
 */
export async function getNextTest(run_id, section) {
    try {
        // Get all test cases
        let query = supabase.from('uat_cases').select('*');
        if (section) {
            query = query.eq('section', section);
        }
        const { data: cases, error: casesError } = await query;
        if (casesError)
            throw casesError;
        // Get executed tests
        const { data: results, error: resultsError } = await supabase
            .from('uat_results')
            .select('case_id')
            .eq('run_id', run_id);
        if (resultsError)
            throw resultsError;
        const executedIds = new Set(results?.map(r => r.case_id) || []);
        // Find first unexecuted test (prioritize critical)
        const priorityOrder = ['critical', 'high', 'medium', 'low'];
        for (const priority of priorityOrder) {
            const nextTest = cases?.find(c => c.priority === priority && !executedIds.has(c.id));
            if (nextTest) {
                return {
                    case_id: nextTest.id,
                    title: nextTest.title,
                    section: nextTest.section
                };
            }
        }
        return null;
    }
    catch (err) {
        console.error('Error getting next test:', err);
        return null;
    }
}
/**
 * Close a UAT run
 */
export async function closeUATRun(run_id) {
    try {
        // Update ended_at
        const { error: updateError } = await supabase
            .from('uat_runs')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', run_id);
        if (updateError)
            throw updateError;
        // Get gate status
        const { data, error } = await supabase.rpc('uat_gate_status', {
            p_run_id: run_id
        });
        if (error)
            throw error;
        return {
            success: true,
            gate_status: data[0]?.gate_color,
            recommendation: data[0]?.recommendation
        };
    }
    catch (err) {
        console.error('Error closing UAT run:', err);
        return {
            success: false,
            error: String(err)
        };
    }
}
/**
 * Infer suspected files based on test case ID
 */
function inferSuspectedFiles(case_id) {
    const files = [];
    // Parse test ID to determine likely files
    const [, section] = case_id.split('-');
    const fileMap = {
        AUTH: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/LoginPage.tsx',
                reason: 'Authentication test failed - login component',
                confidence: 0.9
            },
            {
                path: '/mnt/c/_EHG/ehg/src/contexts/AuthContext.tsx',
                reason: 'Authentication context may have issues',
                confidence: 0.7
            }
        ],
        DASH: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/Index.tsx',
                reason: 'Dashboard test failed - main dashboard component',
                confidence: 0.9
            },
            {
                path: '/mnt/c/_EHG/ehg/src/components/Dashboard',
                reason: 'Dashboard components directory',
                confidence: 0.6
            }
        ],
        VENT: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/VenturesPage.tsx',
                reason: 'Ventures test failed - ventures page component',
                confidence: 0.9
            },
            {
                path: '/mnt/c/_EHG/ehg/src/pages/VentureDetail.tsx',
                reason: 'Venture detail component may be affected',
                confidence: 0.7
            }
        ],
        PORT: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/PortfoliosPage.tsx',
                reason: 'Portfolio test failed - portfolio component',
                confidence: 0.9
            }
        ],
        AI: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx',
                reason: 'AI/EVA test failed - EVA assistant component',
                confidence: 0.9
            },
            {
                path: '/mnt/c/_EHG/ehg/src/pages/AIAgentsPage.tsx',
                reason: 'AI agents page may be affected',
                confidence: 0.7
            }
        ],
        GOV: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/Governance.tsx',
                reason: 'Governance test failed - governance component',
                confidence: 0.8
            }
        ],
        TEAM: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/TeamPage.tsx',
                reason: 'Team test failed - team management component',
                confidence: 0.8
            }
        ],
        RPT: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/Reports.tsx',
                reason: 'Reports test failed - reports component',
                confidence: 0.8
            }
        ],
        SET: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/settings.tsx',
                reason: 'Settings test failed - settings component',
                confidence: 0.9
            }
        ],
        NOT: [
            {
                path: '/mnt/c/_EHG/ehg/src/pages/Notifications.tsx',
                reason: 'Notifications test failed - notifications component',
                confidence: 0.9
            }
        ]
    };
    return fileMap[section] || [
        {
            path: '/mnt/c/_EHG/ehg/src',
            reason: `Test in ${section} section failed - check relevant components`,
            confidence: 0.5
        }
    ];
}
/**
 * Get test cases by section
 */
export async function getTestCasesBySection(section) {
    try {
        let query = supabase.from('uat_cases').select('*').order('id');
        if (section) {
            query = query.eq('section', section);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    }
    catch (err) {
        console.error('Error getting test cases:', err);
        return [];
    }
}
/**
 * Get open defects for a run
 */
export async function getOpenDefects(run_id) {
    try {
        const { data, error } = await supabase
            .from('uat_defects')
            .select('*')
            .eq('run_id', run_id)
            .eq('status', 'open')
            .order('severity');
        if (error)
            throw error;
        return data || [];
    }
    catch (err) {
        console.error('Error getting open defects:', err);
        return [];
    }
}
/**
 * Export run results
 */
export async function exportRunResults(run_id, format = 'json') {
    try {
        // Get all results for the run
        const { data: results, error: resultsError } = await supabase
            .from('uat_results')
            .select(`
        *,
        uat_cases (id, section, title, priority)
      `)
            .eq('run_id', run_id)
            .order('recorded_at');
        if (resultsError)
            throw resultsError;
        // Get run stats
        const stats = await getRunStats(run_id);
        // Get defects
        const defects = await getOpenDefects(run_id);
        if (format === 'json') {
            return JSON.stringify({
                run_id,
                stats,
                results,
                defects
            }, null, 2);
        }
        else {
            // CSV format
            const csv = [
                'Test ID,Section,Title,Priority,Status,Evidence URL,Notes,Recorded At',
                ...(results || []).map(r => `"${r.case_id}","${r.uat_cases.section}","${r.uat_cases.title}","${r.uat_cases.priority}","${r.status}","${r.evidence_url || ''}","${r.notes || ''}","${r.recorded_at}"`)
            ].join('\n');
            return csv;
        }
    }
    catch (err) {
        console.error('Error exporting run results:', err);
        return '';
    }
}
