# DirectiveLab Enhanced Features - User Story

## Primary User Story
**As a chairman/executive**, I want to submit strategic directives through an enhanced 7-step workflow that provides visual feedback, policy analysis, and confirmation checkpoints, so that I can ensure my requirements are properly understood and implemented.

## User Journey Map

### Phase 1: Initial Access
**Story**: As a user, I want to easily access the DirectiveLab from the main dashboard
- **Given**: I'm on the EHG_Engineer dashboard at `http://localhost:3000`
- **When**: I look for DirectiveLab functionality
- **Then**: I should see a clear way to start the directive submission process
- **Acceptance**: DirectiveLab interface is accessible within 1-2 clicks

### Phase 2: Step-by-Step Workflow
**Story**: As a user, I want to complete a guided 7-step process with visual feedback

#### Step 1: Input & Screenshot
- **Given**: I'm in the DirectiveLab interface
- **When**: I enter my feedback/requirements in a text area
- **Then**: I should be able to submit and proceed to step 2
- **Test Data**: "Implement dark mode toggle with enhanced UX features including policy badges and notifications"

#### Step 2: Intent Summary
- **Given**: My input has been submitted
- **When**: The system processes my input
- **Then**: I should see an AI-generated intent summary
- **Acceptance**: Intent summary appears within 5-10 seconds and accurately reflects my input

#### Step 3: Classification with Override
- **Given**: I'm viewing the strategic/tactical classification
- **When**: I disagree with the AI assessment
- **Then**: I should be able to adjust the classification using a slider
- **Test**: Move slider to different percentage, verify it updates the classification

#### Step 4: Impact Analysis
- **Given**: Classification is confirmed
- **When**: The system analyzes impact
- **Then**: I should see comprehensive impact analysis with risk assessment
- **Hidden Feature**: Critical analysis should be generated but not displayed to user

#### Step 5: Synthesis with Policy Badges
- **Given**: Impact analysis is complete
- **When**: I review the synthesis
- **Then**: I should see:
  - Aligned requirements with policy badges (UI, DB, COMPLEX, ACCESS, SECURITY, PROCESS)
  - Required changes with policy badges
  - Recommended enhancements with policy badges
  - Policy badge tooltips on hover
  - Review confirmation checkbox
- **Acceptance**: Cannot proceed without checking the review confirmation

#### Step 6: Clarifying Questions
- **Given**: Synthesis is confirmed
- **When**: The system presents clarifying questions (or confirms none needed)
- **Then**: I should see:
  - Either questions to answer OR confirmation no questions needed
  - Review confirmation checkbox
- **Acceptance**: Cannot proceed without review confirmation

#### Step 7: Final Confirmation with Actions
- **Given**: All previous steps completed
- **When**: I reach final confirmation
- **Then**: I should see:
  - Complete summary of my directive
  - Key metrics (strategic %, risk level, effort estimate)
  - Copy Summary button (with success toast)
  - Regenerate button (with loading state)
  - Final confirmation checkbox
- **Acceptance**: Can copy summary, regenerate content, and final submission requires checkbox

### Phase 3: Advanced Features

#### Edit Invalidation Warnings
**Story**: As a user, when I go back to edit previous steps, I want to be warned about potential impacts
- **Given**: I'm on step 4 or later
- **When**: I click "Back" to edit a previous step
- **Then**: I should see a toast warning about potentially invalidating downstream content
- **Test**: Navigate to step 5, then go back to step 2, verify warning appears

#### Toast Notification System
**Story**: As a user, I want immediate feedback for my actions
- **Given**: I perform actions like copying, regenerating, or editing
- **When**: These actions complete
- **Then**: I should see appropriate toast notifications
- **Types**: Success (copy), Warning (edit invalidation), Info (regeneration)

#### Policy Badge System
**Story**: As a user, I want to understand the complexity and impact of requirements
- **Given**: I'm viewing synthesis items
- **When**: I look at each requirement
- **Then**: I should see color-coded badges indicating:
  - UI complexity (blue)
  - Database impact (purple)
  - Overall complexity (orange)
  - Access control needs (green)
  - Security implications (red)
  - Process impact (yellow)
- **Interaction**: Hovering shows detailed tooltips

## Test Scenarios by Priority

### Highest Priority Tests
1. **Complete Happy Path Workflow** - User completes all 7 steps successfully
2. **Policy Badges Visibility** - All badge types appear correctly with proper colors
3. **Review Checkboxes Enforcement** - Steps 5 & 6 require confirmation to proceed

### High Priority Tests  
4. **Copy/Regenerate Functionality** - Step 7 action buttons work with proper feedback
5. **Edit Invalidation Warnings** - Back navigation shows appropriate warnings
6. **Classification Override** - Step 3 slider allows manual adjustment

### Medium Priority Tests
7. **Toast Notification System** - All action types show appropriate toasts
8. **Critical Analysis Generation** - Backend analysis created (verified via logs/data)
9. **Visual Consistency** - Policy badges maintain consistent styling
10. **Performance** - Each step completes within acceptable timeframes

## Success Criteria
- [ ] User can complete entire 7-step workflow
- [ ] All policy badges display correctly with tooltips
- [ ] Review checkboxes prevent advancement until checked
- [ ] Copy/regenerate buttons function with user feedback
- [ ] Edit warnings appear when navigating backwards
- [ ] Classification slider allows override
- [ ] Toast notifications provide appropriate feedback
- [ ] No critical errors or timeouts during normal flow

## Edge Cases to Test
- Empty input submission
- Network timeout during step transitions
- Back/forward browser navigation
- Multiple rapid clicks on action buttons
- Very long text input (>1000 characters)
- Classification slider edge values (0%, 100%)

This user story provides a structured approach to testing that follows the actual user experience rather than just testing individual features in isolation.