/**
 * SDIP Dashboard Client
 * Frontend JavaScript for SDIP interaction
 * Created: 2025-01-03
 */

// API Configuration
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3457' 
    : '/api';

// Global state
let currentUser = null;
let currentSubmission = null;
let authToken = null;

// ============================================
// Authentication
// ============================================

async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            authToken = data.accessToken;
            currentUser = data.user;
            updateUserInfo();
            loadSubmissions();
            return true;
        } else {
            const error = await response.json();
            alert(`Login failed: ${error.error}`);
            return false;
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
        return false;
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    document.cookie = 'sdip_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    window.location.reload();
}

function updateUserInfo() {
    if (currentUser) {
        document.getElementById('userName').textContent = `User: ${currentUser.id}`;
        document.getElementById('userRole').textContent = `Role: ${currentUser.role}`;
        
        // Show/hide features based on role
        if (currentUser.role === 'chairman') {
            document.getElementById('submissionForm').style.display = 'block';
        } else {
            document.getElementById('submissionForm').style.display = 'none';
        }
    }
}

// ============================================
// Submission Management
// ============================================

async function submitFeedback(event) {
    event.preventDefault();
    
    const feedback = document.getElementById('feedbackInput').value;
    const screenshot_url = document.getElementById('screenshotUrl').value;
    
    // Show loading
    document.getElementById('submitLoader').style.display = 'inline-block';
    
    try {
        const response = await fetch(`${API_BASE}/api/sdip/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            credentials: 'include',
            body: JSON.stringify({ feedback, screenshot_url })
        });

        if (response.ok) {
            const data = await response.json();
            alert(`Submission created! ID: ${data.submission_id}`);
            
            // Clear form
            document.getElementById('feedbackInput').value = '';
            document.getElementById('screenshotUrl').value = '';
            
            // Reload submissions
            loadSubmissions();
            
            // Open validation modal
            openValidationModal(data.submission_id);
        } else {
            const error = await response.json();
            alert(`Submission failed: ${error.error}`);
        }
    } catch (error) {
        console.error('Submission error:', error);
        alert('Failed to submit feedback.');
    } finally {
        document.getElementById('submitLoader').style.display = 'none';
    }
}

async function loadSubmissions() {
    try {
        const response = await fetch(`${API_BASE}/api/sdip/list`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            credentials: 'include'
        });

        if (response.ok) {
            const submissions = await response.json();
            displaySubmissions(submissions);
            updateStatistics(submissions);
        }
    } catch (error) {
        console.error('Failed to load submissions:', error);
    }
}

function displaySubmissions(submissions) {
    const tbody = document.getElementById('submissionsTableBody');
    tbody.innerHTML = '';
    
    submissions.forEach(submission => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><code>${submission.id}</code></td>
            <td>${submission.submission_title || 'Untitled'}</td>
            <td>${getStatusBadge(submission)}</td>
            <td>${getGateDisplay(submission.current_step)}</td>
            <td>${formatDate(submission.created_at)}</td>
            <td>
                <button class="btn btn-primary" onclick="viewSubmission(${submission.id})">
                    View
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function getStatusBadge(submission) {
    if (submission.validation_complete) {
        return '<span class="status-badge status-validated">Complete</span>';
    } else if (submission.current_step > 1) {
        return '<span class="status-badge status-pending">In Progress</span>';
    } else {
        return '<span class="status-badge status-pending">New</span>';
    }
}

function getGateDisplay(step) {
    const gates = [
        'Input', 'Intent', 'Classification', 
        'Synthesis', 'Questions', 'Summary'
    ];
    
    const display = `
        <div>Gate ${step}: ${gates[step - 1] || 'Unknown'}</div>
        <div class="gate-progress">
            ${gates.map((_, i) => {
                const num = i + 1;
                let className = 'gate-indicator';
                if (num < step) className += ' complete';
                else if (num === step) className += ' current';
                return `<div class="${className}"></div>`;
            }).join('')}
        </div>
    `;
    
    return display;
}

function updateStatistics(submissions) {
    const total = submissions.length;
    const pending = submissions.filter(s => !s.validation_complete).length;
    const completed = submissions.filter(s => s.validation_complete).length;
    
    document.getElementById('totalSubmissions').textContent = total;
    document.getElementById('pendingValidations').textContent = pending;
    document.getElementById('completedSubmissions').textContent = completed;
}

// ============================================
// Gate Validation Modal
// ============================================

async function viewSubmission(id) {
    try {
        const response = await fetch(`${API_BASE}/api/sdip/submission/${id}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            currentSubmission = data.submission;
            openValidationModal(id);
        }
    } catch (error) {
        console.error('Failed to load submission:', error);
    }
}

function openValidationModal(submissionId) {
    const modal = document.getElementById('validationModal');
    modal.classList.add('active');
    
    if (currentSubmission) {
        displayValidationGates();
    }
}

function closeModal() {
    const modal = document.getElementById('validationModal');
    modal.classList.remove('active');
    currentSubmission = null;
}

function displayValidationGates() {
    const modalBody = document.getElementById('modalBody');
    const currentStep = currentSubmission.current_step;
    
    const gates = [
        { num: 1, name: 'Input Provided', field: 'chairman_input' },
        { num: 2, name: 'Intent Confirmation', field: 'intent_summary' },
        { num: 3, name: 'Classification Review', field: 'strat_tac_final' },
        { num: 4, name: 'Synthesis Review', field: 'synthesis' },
        { num: 5, name: 'Questions Answered', field: 'clarifying_questions' },
        { num: 6, name: 'Summary Confirmation', field: 'client_summary' }
    ];
    
    modalBody.innerHTML = gates.map(gate => {
        let className = 'validation-step';
        if (gate.num < currentStep) className += ' complete';
        else if (gate.num === currentStep) className += ' current';
        
        const content = getGateContent(gate, currentSubmission);
        
        return `
            <div class="${className}">
                <div class="step-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="step-number ${gate.num <= currentStep ? 'current' : ''}">
                            ${gate.num}
                        </div>
                        <h3>${gate.name}</h3>
                    </div>
                    ${gate.num < currentStep ? '<span class="status-badge status-validated">✓ Complete</span>' : ''}
                </div>
                <div class="step-content">
                    ${content}
                </div>
            </div>
        `;
    }).join('');
}

function getGateContent(gate, submission) {
    switch (gate.num) {
        case 1:
            return `<p>${submission.chairman_input}</p>`;
        
        case 2:
            if (gate.num === submission.current_step) {
                return `
                    <label>Intent Summary:</label>
                    <textarea id="intentSummary" style="width: 100%; min-height: 100px;">
                        ${submission.intent_summary || ''}
                    </textarea>
                `;
            }
            return `<p>${submission.intent_summary || 'Not yet confirmed'}</p>`;
        
        case 3:
            const stratTac = submission.strat_tac_final;
            if (stratTac) {
                return `
                    <p>Strategic: ${stratTac.strategic_pct || 0}%</p>
                    <p>Tactical: ${stratTac.tactical_pct || 0}%</p>
                `;
            }
            return '<p>Not yet classified</p>';
        
        case 4:
            if (submission.synthesis) {
                const items = [
                    ...(submission.synthesis.aligned || []),
                    ...(submission.synthesis.required || []),
                    ...(submission.synthesis.recommended || [])
                ];
                return `
                    <ul>
                        ${items.map(item => `<li>${item.text || item}</li>`).join('')}
                    </ul>
                `;
            }
            return '<p>Not yet synthesized</p>';
        
        case 5:
            if (submission.clarifying_questions) {
                return `
                    <ol>
                        ${submission.clarifying_questions.map(q => `<li>${q}</li>`).join('')}
                    </ol>
                `;
            }
            return '<p>No questions generated</p>';
        
        case 6:
            return `<p>${submission.client_summary || 'Not yet summarized'}</p>`;
        
        default:
            return '<p>Unknown gate</p>';
    }
}

async function validateCurrentGate() {
    if (!currentSubmission) return;
    
    const step = currentSubmission.current_step;
    let data = {};
    
    // Collect data based on current step
    if (step === 2) {
        data.intent_summary = document.getElementById('intentSummary')?.value;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/sdip/validate-gate/${step}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            credentials: 'include',
            body: JSON.stringify({
                submission_id: currentSubmission.id,
                data
            })
        });

        if (response.ok) {
            const result = await response.json();
            alert(`Gate ${step} validated successfully!`);
            
            // Reload submission
            viewSubmission(currentSubmission.id);
            loadSubmissions();
        } else {
            const error = await response.json();
            alert(`Validation failed: ${error.error}`);
        }
    } catch (error) {
        console.error('Validation error:', error);
        alert('Failed to validate gate.');
    }
}

// ============================================
// Utility Functions
// ============================================

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    const token = getCookie('sdip_token');
    if (token) {
        authToken = token;
        // Decode JWT to get user info (basic decode, not secure)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = { id: payload.userId, role: payload.role };
            updateUserInfo();
            loadSubmissions();
        } catch (e) {
            console.error('Invalid token');
        }
    } else {
        // Show login prompt
        const username = prompt('Enter username (chairman/validator/admin):');
        const password = prompt('Enter password:');
        if (username && password) {
            login(username, password);
        }
    }
    
    // Close modal on outside click
    document.getElementById('validationModal').addEventListener('click', (e) => {
        if (e.target.id === 'validationModal') {
            closeModal();
        }
    });
});

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}