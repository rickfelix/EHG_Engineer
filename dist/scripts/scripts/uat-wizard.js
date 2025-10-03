#!/usr/bin/env node
/**
 * UAT Wizard Agent
 * One-question-at-a-time UAT test execution guide
 * Emits structured payloads for UAT Lead to process
 */
import * as readline from 'readline';
import chalk from 'chalk';
import { getTestCasesBySection, getNextTest } from '../api/uat/handlers';
class UATWizard {
    constructor() {
        this.testCases = [];
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.session = {
            run_id: '',
            mode: 'guided',
            tests_completed: 0,
            tests_remaining: 0
        };
    }
    /**
     * Start the wizard
     */
    async start() {
        console.clear();
        console.log(chalk.cyan.bold('🧙 UAT Wizard - EHG Application Testing'));
        console.log(chalk.gray('One question at a time. Clear, simple, focused.\n'));
        // Get run ID from environment or prompt
        this.session.run_id = process.env.UAT_RUN_ID || await this.ask('Enter UAT Run ID: ');
        // Select mode
        const mode = await this.ask('Mode? (1=Guided, 2=Quick): ');
        this.session.mode = mode === '2' ? 'quick' : 'guided';
        // Load test cases
        await this.loadTestCases();
        // Start testing
        await this.nextTest();
    }
    /**
     * Load test cases from database
     */
    async loadTestCases() {
        const section = await this.ask('Test section? (Enter=All, or AUTH/DASH/VENT/etc): ');
        this.testCases = await getTestCasesBySection(section || undefined);
        this.session.tests_remaining = this.testCases.length;
        console.log(chalk.green(`\n✓ Loaded ${this.testCases.length} tests\n`));
    }
    /**
     * Execute next test
     */
    async nextTest() {
        // Get next test
        const nextTest = await getNextTest(this.session.run_id);
        if (!nextTest) {
            console.log(chalk.yellow('\n✨ All tests completed!\n'));
            this.emitPayload('COMPLETE', '', 'NA');
            process.exit(0);
        }
        this.session.current_test = {
            id: nextTest.case_id,
            section: nextTest.section,
            priority: 'high', // Default priority
            title: nextTest.title
        };
        // Display test header
        console.log(chalk.cyan('\n' + '='.repeat(50)));
        console.log(chalk.bold(`Test: ${nextTest.case_id}`));
        console.log(chalk.white(`Title: ${nextTest.title}`));
        console.log(chalk.gray(`Section: ${nextTest.section}`));
        console.log(chalk.cyan('='.repeat(50) + '\n'));
        // Provide context-aware instructions based on test ID
        this.provideTestInstructions(nextTest.case_id);
        // Quick mode: just ask for result
        if (this.session.mode === 'quick') {
            await this.quickTest();
        }
        else {
            await this.guidedTest();
        }
    }
    /**
     * Quick test mode - minimal questions
     */
    async quickTest() {
        const result = await this.ask('Result? (p=PASS, f=FAIL, b=BLOCKED, n=NA): ');
        let status;
        switch (result.toLowerCase()) {
            case 'p':
                status = 'PASS';
                break;
            case 'f':
                status = 'FAIL';
                break;
            case 'b':
                status = 'BLOCKED';
                break;
            case 'n':
                status = 'NA';
                break;
            default:
                console.log(chalk.red('Invalid input. Try again.'));
                return this.quickTest();
        }
        // For failures, ask for evidence
        let evidence = { url: '', heading: '', toast: '', notes: '' };
        if (status === 'FAIL' || status === 'BLOCKED') {
            evidence.notes = await this.ask('What happened? (brief): ');
            evidence.url = await this.ask('Page URL (Enter=skip): ');
            evidence.toast = await this.ask('Error message (Enter=skip): ');
        }
        // Emit and continue
        this.emitPayload(this.session.current_test.id, status, evidence.url, evidence.heading, evidence.toast, evidence.notes);
        this.session.tests_completed++;
        await this.nextTest();
    }
    /**
     * Guided test mode - step by step
     */
    async guidedTest() {
        // Step 1: Navigate
        const navigated = await this.ask('Did you navigate to the correct page? (y/n): ');
        if (navigated.toLowerCase() !== 'y') {
            const blocked = await this.ask('Are you blocked? (y/n): ');
            if (blocked.toLowerCase() === 'y') {
                const reason = await this.ask('Blocking reason: ');
                this.emitPayload(this.session.current_test.id, 'BLOCKED', '', '', '', reason);
                this.session.tests_completed++;
                return this.nextTest();
            }
        }
        // Step 2: Execute test
        const executed = await this.ask('Did you complete the test steps? (y/n): ');
        if (executed.toLowerCase() !== 'y') {
            const why = await this.ask('Why not? (brief): ');
            this.emitPayload(this.session.current_test.id, 'NA', '', '', '', why);
            this.session.tests_completed++;
            return this.nextTest();
        }
        // Step 3: Result
        const passed = await this.ask('Did the test PASS? (y/n): ');
        const status = passed.toLowerCase() === 'y' ? 'PASS' : 'FAIL';
        // Step 4: Evidence (for failures)
        let evidence = { url: '', heading: '', toast: '', notes: '' };
        if (status === 'FAIL') {
            evidence.url = await this.ask('Current page URL: ');
            evidence.heading = await this.ask('Page heading/title: ');
            evidence.toast = await this.ask('Error message (if any): ');
            evidence.notes = await this.ask('What went wrong? (brief): ');
        }
        // Emit payload
        this.emitPayload(this.session.current_test.id, status, evidence.url, evidence.heading, evidence.toast, evidence.notes);
        this.session.tests_completed++;
        await this.nextTest();
    }
    /**
     * Provide context-aware test instructions
     */
    provideTestInstructions(case_id) {
        const instructions = {
            'TEST-AUTH-001': [
                '1. Go to: http://localhost:5173/login',
                '2. Enter valid credentials',
                '3. Click "Sign In"',
                '4. Verify: Dashboard loads'
            ],
            'TEST-AUTH-002': [
                '1. Go to: http://localhost:5173/login',
                '2. Enter INVALID credentials',
                '3. Click "Sign In"',
                '4. Verify: Error message appears'
            ],
            'TEST-DASH-001': [
                '1. Go to: http://localhost:5173/dashboard',
                '2. Wait for page load',
                '3. Verify: Metrics display',
                '4. Check: No console errors'
            ],
            'TEST-VENT-001': [
                '1. Go to: http://localhost:5173/ventures',
                '2. Verify: Ventures list loads',
                '3. Check: At least 1 venture visible',
                '4. Verify: No loading errors'
            ],
            'TEST-VENT-004': [
                '1. Go to: http://localhost:5173/ventures',
                '2. Click "New Venture" button',
                '3. Fill in required fields',
                '4. Click "Create"',
                '5. Verify: Success message & redirect'
            ]
            // Add more as needed
        };
        const steps = instructions[case_id];
        if (steps) {
            console.log(chalk.yellow('Steps:'));
            steps.forEach(step => console.log(chalk.gray(step)));
            console.log();
        }
        else {
            console.log(chalk.gray('Execute test as per UAT script.\n'));
        }
    }
    /**
     * Emit structured payload for UAT Lead
     */
    emitPayload(case_id, status, url, heading, toast, notes) {
        const payload = [
            '[UAT-RESULT]',
            `run_id=${this.session.run_id}`,
            `case_id=${case_id}`,
            `status=${status}`,
            url ? `evidence.url=${url}` : '',
            heading ? `evidence.heading=${heading}` : '',
            toast ? `evidence.toast=${toast}` : '',
            notes ? `notes=${notes}` : '',
            '[/UAT-RESULT]'
        ].filter(Boolean).join('\n');
        console.log(chalk.magenta('\n' + payload + '\n'));
        // Progress indicator
        const progress = Math.round((this.session.tests_completed / this.testCases.length) * 100);
        console.log(chalk.blue(`Progress: ${this.session.tests_completed}/${this.testCases.length} (${progress}%)\n`));
    }
    /**
     * Simple question prompt
     */
    ask(question) {
        return new Promise(resolve => {
            this.rl.question(chalk.white(question), answer => {
                resolve(answer.trim());
            });
        });
    }
}
// Run if executed directly
if (require.main === module) {
    const wizard = new UATWizard();
    wizard.start().catch(console.error);
}
export { UATWizard };
