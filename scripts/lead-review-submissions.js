#!/usr/bin/env node
/**
 * LEAD Agent - Directive Submission Review Tool
 * 
 * This tool helps the LEAD agent review directive submissions,
 * extracting critical context that isn't present in the SD itself.
 * It provides a comprehensive view of chairman inputs, processing
 * history, and gate validation status.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

class LEADSubmissionReviewer {
    constructor() {
        this.stats = {
            total: 0,
            needingReview: 0,
            withSD: 0,
            pending: 0,
            failed: 0
        };
    }

    async reviewSubmissions() {
        console.log('\n🎯 LEAD Agent - Directive Submission Review');
        console.log('=' .repeat(60));
        console.log('Analyzing submissions for strategic context and approval...\n');

        try {
            // Get all submissions
            const { data: submissions, error } = await supabase
                .from('directive_submissions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching submissions:', error.message);
                return;
            }

            if (!submissions || submissions.length === 0) {
                console.log('📋 No directive submissions found.');
                return;
            }

            this.stats.total = submissions.length;

            // Categorize submissions
            const categorized = this.categorizeSubmissions(submissions);

            // Display submissions needing review
            if (categorized.needingReview.length > 0) {
                console.log('🔴 SUBMISSIONS NEEDING LEAD REVIEW');
                console.log('-'.repeat(60));
                for (const submission of categorized.needingReview) {
                    await this.displaySubmissionDetails(submission, 'review');
                }
            }

            // Display submissions with SDs
            if (categorized.withSD.length > 0) {
                console.log('\n✅ SUBMISSIONS WITH CREATED SDs');
                console.log('-'.repeat(60));
                for (const submission of categorized.withSD) {
                    await this.displaySubmissionDetails(submission, 'verify');
                }
            }

            // Display pending submissions
            if (categorized.pending.length > 0) {
                console.log('\n⏳ PENDING SUBMISSIONS (Gates Incomplete)');
                console.log('-'.repeat(60));
                for (const submission of categorized.pending) {
                    await this.displaySubmissionDetails(submission, 'monitor');
                }
            }

            // Display failed submissions
            if (categorized.failed.length > 0) {
                console.log('\n❌ FAILED SUBMISSIONS');
                console.log('-'.repeat(60));
                for (const submission of categorized.failed) {
                    await this.displaySubmissionDetails(submission, 'remediate');
                }
            }

            // Display summary and recommendations
            this.displaySummary();
            this.provideRecommendations(categorized);

        } catch (error) {
            console.error('Unexpected error:', error);
        }
    }

    categorizeSubmissions(submissions) {
        const categorized = {
            needingReview: [],
            withSD: [],
            pending: [],
            failed: []
        };

        for (const submission of submissions) {
            const hasSD = submission.gate_status?.resulting_sd_id;
            const isComplete = submission.status === 'completed';
            const isFailed = submission.status === 'failed' || submission.gate_status?.status === 'failed';

            if (isFailed) {
                categorized.failed.push(submission);
                this.stats.failed++;
            } else if (isComplete && !hasSD) {
                categorized.needingReview.push(submission);
                this.stats.needingReview++;
            } else if (hasSD) {
                categorized.withSD.push(submission);
                this.stats.withSD++;
            } else {
                categorized.pending.push(submission);
                this.stats.pending++;
            }
        }

        return categorized;
    }

    async displaySubmissionDetails(submission, actionType) {
        console.log(`\n📌 Submission: ${submission.submission_id || submission.id}`);
        console.log(`   Status: ${this.getStatusBadge(submission.status)}`);
        console.log(`   Created: ${new Date(submission.created_at).toLocaleDateString()}`);
        
        // Display chairman input
        if (submission.chairman_input) {
            console.log('\n   📝 Chairman Input:');
            const input = submission.chairman_input.substring(0, 200);
            console.log(`   "${input}${submission.chairman_input.length > 200 ? '...' : ''}"`);
        }

        // Display intent summary
        if (submission.intent_summary) {
            console.log('\n   🎯 Processed Intent:');
            console.log(`   ${submission.intent_summary}`);
        }

        // Display visual context
        if (submission.screenshot_url) {
            console.log(`\n   📸 Visual Context: ${submission.screenshot_url}`);
        }

        // Display gate status
        if (submission.gate_status) {
            console.log('\n   🚦 Gate Validation:');
            const gates = submission.completed_steps || [];
            console.log(`   Completed: ${gates.length}/7 gates`);
            
            if (submission.gate_status.resulting_sd_id) {
                console.log(`   ✅ Created SD: ${submission.gate_status.resulting_sd_id}`);
                
                // Fetch and display SD details
                await this.displayLinkedSD(submission.gate_status.resulting_sd_id);
            }
        }

        // Display recommended action
        console.log(`\n   ⚡ LEAD Action: ${this.getRecommendedAction(actionType)}`);
    }

    async displayLinkedSD(sdId) {
        const { data: sd } = await supabase
            .from('strategic_directives_v2')
            .select('title, status, priority')
            .eq('id', sdId)
            .single();

        if (sd) {
            console.log(`\n   📋 Linked Strategic Directive:`);
            console.log(`      Title: ${sd.title?.substring(0, 60)}...`);
            console.log(`      Status: ${sd.status}`);
            console.log(`      Priority: ${sd.priority || 'Not set'}`);
        }
    }

    getStatusBadge(status) {
        const badges = {
            'completed': '✅ Completed',
            'pending': '⏳ Pending',
            'failed': '❌ Failed',
            'pending_review': '🔍 Pending Review'
        };
        return badges[status] || status;
    }

    getRecommendedAction(actionType) {
        const actions = {
            'review': 'Review and create SD → node scripts/create-sd-from-submission.js',
            'verify': 'Verify SD accuracy and create handoff → node scripts/unified-handoff-system.js',
            'monitor': 'Monitor gate progression → node scripts/check-submission-status.js',
            'remediate': 'Archive or remediate → node scripts/archive-submission.js'
        };
        return actions[actionType] || 'Review required';
    }

    displaySummary() {
        console.log('\n\n📊 SUBMISSION REVIEW SUMMARY');
        console.log('=' .repeat(60));
        console.log(`Total Submissions: ${this.stats.total}`);
        console.log(`🔴 Needing Review: ${this.stats.needingReview}`);
        console.log(`✅ With SDs: ${this.stats.withSD}`);
        console.log(`⏳ Pending: ${this.stats.pending}`);
        console.log(`❌ Failed: ${this.stats.failed}`);
    }

    provideRecommendations(categorized) {
        console.log('\n\n🎯 LEAD RECOMMENDATIONS');
        console.log('=' .repeat(60));

        if (categorized.needingReview.length > 0) {
            console.log('\n1. IMMEDIATE ACTION - Review completed submissions:');
            categorized.needingReview.forEach(sub => {
                console.log(`   → Review ${sub.submission_id}: "${sub.intent_summary?.substring(0, 50)}..."`);
            });
            console.log('   Command: node scripts/create-sd-from-submission.js [submission-id]');
        }

        if (categorized.withSD.length > 0) {
            console.log('\n2. VERIFY & HANDOFF - Check SD accuracy:');
            categorized.withSD.slice(0, 3).forEach(sub => {
                console.log(`   → Verify ${sub.gate_status?.resulting_sd_id}`);
            });
            console.log('   Command: node scripts/query-active-sds.js');
        }

        if (categorized.pending.length > 0) {
            console.log('\n3. MONITOR - Track gate progression:');
            console.log(`   ${categorized.pending.length} submissions in progress`);
        }

        if (categorized.failed.length > 0) {
            console.log('\n4. REMEDIATE - Handle failed submissions:');
            console.log(`   ${categorized.failed.length} failed submissions need attention`);
        }

        console.log('\n📋 Next Steps:');
        console.log('1. Review submissions with rich context (chairman input, screenshots)');
        console.log('2. Create SDs for approved submissions');
        console.log('3. Verify existing SDs capture original intent');
        console.log('4. Create LEAD→PLAN handoffs for active SDs');
        console.log('\nUse this context to make informed strategic decisions!');
    }
}

// Execute
async function main() {
    const reviewer = new LEADSubmissionReviewer();
    await reviewer.reviewSubmissions();
}

main().catch(console.error);