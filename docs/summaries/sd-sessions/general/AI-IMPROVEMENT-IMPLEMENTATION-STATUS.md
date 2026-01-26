# AI-Powered EVA Improvement Implementation Status


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: api, testing, feature, sd

## Completed Steps (70% Done)

### ✅ 1. Threshold Detection Logic (`evaValidation.ts`)
**Status**: COMPLETE (Updated to 70% threshold)

**Added Functions**:
- `shouldOfferAIImprovement()` - Detects when AI help should be offered
  - Triggers when score <70, confidence <0.7, or 3+ weaknesses
  - Checks for missing critical content (problem statement, solution, impact)

- `getImprovementSeverity()` - Returns severity level
  - `critical`: score <40 or confidence <0.4
  - `recommended`: score <70 or confidence <0.7
  - `optional`: otherwise

**Location**: Lines 198-227

---

### ✅ 2. AI Service Function (`intelligenceAgents.ts`)
**Status**: COMPLETE

**Added Interfaces**:
- `DetectedIssue` - Represents vagueness/missing content issues
- `FieldImprovement` - Before/after comparison for each field
- `AIImprovementSuggestions` - Complete AI response structure
- `VentureImprovementInput` - Input data for AI analysis

**Added Function**:
- `improveVentureDescription()` - Calls Supabase Edge Function
  - Sends venture data + EVA weaknesses
  - Receives AI-generated improvements
  - Tracks token usage and cost

**Location**: Lines 625-721

**Pattern**: Follows same structure as `assessComplexityLLM()`

---

### ✅ 3. Dialog Component (`AIImprovementDialog.tsx`)
**Status**: COMPLETE

**Features**:
- Shows overall AI assessment
- Displays score improvement estimate (before → after)
- Lists detected issues with severity badges
- Before/after comparison for each field
- Checkboxes to select which improvements to apply
- Rationale explanation for each suggestion
- Token usage and cost display

**Location**: New file (270 lines)

**Pattern**: Similar to `MockDataConfirmationDialog.tsx`

---

### ✅ 4. UI Button in EVA Display (`ChairmanFeedbackDisplay.tsx`)
**Status**: COMPLETE

**Changes**:
- Added `Button` and `Sparkles` icon imports
- Added `onImproveWithAI` callback prop
- Added "Improve with AI" button after suggestions section
- Button appears when `score <70 OR confidence <0.7`
- Includes helper text explaining feature

**Location**: Lines 126-141

---

## Remaining Steps (30% Remaining)

### ⏳ 5. Integration into VentureCreationPage
**Status**: IN PROGRESS

**What's Needed**:

```typescript
// Add imports
import { improveVentureDescription, AIImprovementSuggestions } from '@/services/intelligenceAgents';
import { AIImprovementDialog } from '../AIImprovementDialog';

// Add state (after line 166)
const [showAIImprovementDialog, setShowAIImprovementDialog] = useState(false);
const [aiSuggestions, setAiSuggestions] = useState<AIImprovementSuggestions | null>(null);
const [isLoadingAISuggestions, setIsLoadingAISuggestions] = useState(false);

// Add handler function (after line 850)
const handleImproveWithAI = async () => {
  if (!evaValidation) return;

  setShowAIImprovementDialog(true);
  setIsLoadingAISuggestions(true);

  try {
    const suggestions = await improveVentureDescription({
      name: formData.name,
      description: formData.description,
      problemStatement: formData.problemStatement,
      targetMarket: formData.targetMarket,
      category: formData.category,
      currentScore: evaValidation.qualityScore,
      currentConfidence: evaValidation.confidence,
      weaknesses: evaValidation.weaknesses,
      suggestions: evaValidation.suggestions,
    });

    setAiSuggestions(suggestions);
  } catch (error) {
    logError('Failed to get AI improvement suggestions', error);
    setError('Failed to get AI suggestions. Please try again.');
    setShowAIImprovementDialog(false);
  } finally {
    setIsLoadingAISuggestions(false);
  }
};

// Add apply handler
const handleApplyAISuggestions = (selectedImprovements: FieldImprovement[]) => {
  selectedImprovements.forEach((improvement) => {
    if (improvement.field === 'name') {
      setFormData(prev => ({ ...prev, name: improvement.suggestedValue }));
    } else if (improvement.field === 'description') {
      setFormData(prev => ({ ...prev, description: improvement.suggestedValue }));
    } else if (improvement.field === 'problemStatement') {
      setFormData(prev => ({ ...prev, problemStatement: improvement.suggestedValue }));
    } else if (improvement.field === 'targetMarket') {
      setFormData(prev => ({ ...prev, targetMarket: improvement.suggestedValue }));
    }
  });

  // Re-run EVA validation after applying improvements
  setTimeout(() => {
    const updatedValidation = calculateEVAQualityScore({
      title: formData.name,
      description: formData.description,
      category: formData.category || '',
      tags: [],
      visionAlignment: 0,
      strategicFocus: [],
    });
    setEvaValidation(updatedValidation);
    setSuccess(`Applied ${selectedImprovements.length} AI suggestions. Quality score improved!`);
  }, 100);
};

// Pass to VentureForm (around line 1549)
<VentureForm
  formData={formData}
  companies={companies || []}
  companyName={currentCompany?.name}
  onFieldChange={handleFieldChange}
  onImproveWithAI={handleImproveWithAI}  // NEW
  // ...other props
/>

// Add dialog before closing </div> (around line 1900)
<AIImprovementDialog
  isOpen={showAIImprovementDialog}
  onClose={() => setShowAIImprovementDialog(false)}
  suggestions={aiSuggestions}
  isLoading={isLoadingAISuggestions}
  onApplySuggestions={handleApplyAISuggestions}
/>
```

**Files to Edit**:
- `/mnt/c/_EHG/EHG/src/components/ventures/VentureCreationPage/VentureCreationPage.tsx`
- `/mnt/c/_EHG/EHG/src/components/ventures/VentureCreationPage/VentureForm.tsx` (add onImproveWithAI prop)

---

### ⏳ 6. Supabase Edge Function
**Status**: NOT STARTED

**What's Needed**: Create new Supabase Edge Function `improve-venture-description`

**Example Structure** (based on complexity-assessment pattern):

```python
# supabase/functions/improve-venture-description/index.py

from openai import OpenAI
import os

openai = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

SYSTEM_PROMPT = """You are an expert venture capital analyst specializing in early-stage startups.
Your role is to help entrepreneurs refine their venture descriptions to be clear, specific, and compelling.

Analyze the provided venture information and identify:
1. Vague or generic language
2. Missing critical details (problem, solution, impact, target market)
3. Unclear value propositions
4. Weak differentiation

For each issue, provide specific, actionable suggestions with concrete examples.
Focus on making descriptions measurable, specific, and business-focused."""

def handler(req):
    body = req.json()

    # Extract inputs
    venture_name = body.get('venture_name', '')
    description = body.get('description', '')
    problem_statement = body.get('problem_statement', '')
    target_market = body.get('target_market', '')
    current_score = body.get('current_score', 0)
    weaknesses = body.get('weaknesses', [])
    suggestions = body.get('suggestions', [])

    # Build user prompt
    user_prompt = f"""
Venture Name: {venture_name}
Description: {description}
Problem Statement: {problem_statement}
Target Market: {target_market}

Current Quality Score: {current_score}/100
Current Weaknesses: {', '.join(weaknesses)}

Please analyze this venture description and provide:
1. Overall assessment of clarity and specificity
2. Detected issues (vagueness, missing context, unclear impact)
3. Improved versions of each field with rationale
4. Estimated quality score after improvements

Return JSON with this structure:
{{
  "overall_assessment": "string",
  "detected_issues": [
    {{"type": "vagueness|missing_context|unclear_impact|weak_problem|generic_language", "description": "string", "severity": "high|medium|low", "affected_field": "name|description|problemStatement|targetMarket"}}
  ],
  "improvements": [
    {{"field": "name|description|problemStatement|targetMarket", "current_value": "string", "suggested_value": "string", "rationale": "string", "improvement_type": "string"}}
  ],
  "estimated_new_score": 75,
  "estimated_new_confidence": 0.8
}}
"""

    # Call GPT-4o
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        response_format={"type": "json_object"}
    )

    # Parse response
    result = json.loads(response.choices[0].message.content)

    # Add usage metrics
    result['llm_tokens_used'] = response.usage.total_tokens
    result['llm_cost_cents'] = calculate_cost(response.usage)

    return result
```

**Deployment**:
```bash
cd /mnt/c/_EHG/EHG
supabase functions deploy improve-venture-description
```

---

### ⏳ 7. Testing
**Status**: NOT STARTED

**Test Scenarios**:

1. **Low Score Test** (score <40):
   - Name: "AI Solution"
   - Description: "An AI solution"
   - Expected: Critical severity, button appears, specific suggestions

2. **Medium Score Test** (score 40-59):
   - Name: "AI-Powered Tool"
   - Description: "Uses AI to help businesses"
   - Expected: Recommended severity, button appears

3. **Good Score Test** (score 60-79):
   - Name: "AI-Powered Inventory Optimizer"
   - Description: "Machine learning platform for retail inventory management"
   - Expected: Optional severity, button may appear

4. **Excellent Score Test** (score 80+):
   - Complete, specific description
   - Expected: No button (no AI needed)

5. **Apply Suggestions Test**:
   - Select 2 of 3 suggestions
   - Click "Apply 2 Improvements"
   - Expected: FormData updates, EVA re-runs, score improves

---

## Summary

**Files Modified**: 3
- evaValidation.ts (threshold detection)
- intelligenceAgents.ts (AI service)
- ChairmanFeedbackDisplay.tsx (UI button)

**Files Created**: 1
- AIImprovementDialog.tsx (dialog component)

**Files Remaining**: 2
- VentureCreationPage.tsx (integration)
- VentureForm.tsx (pass callback prop)

**Backend Required**: 1
- Supabase Edge Function: `improve-venture-description`

**Estimated Remaining Time**: 1-2 hours
- VentureCreationPage integration: 30 minutes
- Edge Function creation: 30-60 minutes
- Testing: 30 minutes

---

## Next Steps

1. Complete VentureCreationPage integration
2. Update VentureForm props
3. Create Supabase Edge Function
4. Test with various quality scores
5. Commit and push to GitHub
