#!/usr/bin/env python3
"""
Automated Accessibility Label Fixer for WCAG 3.3.2 Compliance

This script fixes missing form label associations by:
1. Adding id attributes to inputs that have Labels without htmlFor
2. Adding htmlFor attributes to Labels that precede inputs
3. Adding aria-label to inputs that don't have visual labels
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple

# Files to fix (high priority first)
PRIORITY_FILES = [
    "../ehg/src/components/board/BoardMemberManagement.tsx",
    "../ehg/src/components/agents/AgentDeployDialog.tsx",
    "../ehg/src/components/agents/AgentPresetsTab.tsx",
    "../ehg/src/components/agents/SearchPreferencesTab.tsx",
    "../ehg/src/components/analytics/AnalyticsDashboard.tsx",
    "../ehg/src/components/analytics/DecisionHistoryTable.tsx",
]

def generate_id_from_label(label_text: str) -> str:
    """Generate a kebab-case id from label text"""
    # Remove special characters and convert to kebab-case
    id_str = re.sub(r'[^\w\s-]', '', label_text.lower())
    id_str = re.sub(r'[\s_]+', '-', id_str)
    id_str = id_str.strip('-')
    return id_str[:50]  # Limit length

def fix_label_input_pairs(content: str) -> Tuple[str, int]:
    """
    Fix Label/Input pairs where Label is missing htmlFor.
    Pattern: <Label>Text</Label> followed by <Input
    """
    fixes_applied = 0
    lines = content.split('\n')
    result_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Match: <Label>Some Text</Label> (without htmlFor)
        label_match = re.search(r'<Label(?![^>]*htmlFor)([^>]*)>(.*?)</Label>', line)
        
        if label_match and i + 1 < len(lines):
            # Check next few lines for an Input/Select/Textarea without id
            for offset in range(1, 5):
                if i + offset >= len(lines):
                    break
                    
                next_line = lines[i + offset]
                
                # Check for Input/Select/Textarea without id
                input_match = re.search(r'<(Input|Select|Textarea|input|select|textarea)(?![^>]*id=)', next_line)
                
                if input_match:
                    label_text = label_match.group(2).strip()
                    field_id = generate_id_from_label(label_text)
                    
                    # Add htmlFor to Label
                    label_attrs = label_match.group(1)
                    new_label = f'<Label htmlFor="{field_id}"{label_attrs}>{label_text}</Label>'
                    lines[i] = line.replace(label_match.group(0), new_label)
                    
                    # Add id to Input  
                    input_tag = input_match.group(1)
                    # Insert id right after the tag name
                    new_input = re.sub(
                        f'<{input_tag}(\\s|>)',
                        f'<{input_tag} id="{field_id}"\\1',
                        next_line,
                        count=1
                    )
                    lines[i + offset] = new_input
                    
                    fixes_applied += 1
                    break
        
        result_lines.append(lines[i])
        i += 1
    
    return '\n'.join(result_lines), fixes_applied

def fix_select_triggers(content: str) -> Tuple[str, int]:
    """
    Fix Select components where Label exists but SelectTrigger has no id.
    Pattern: <Label htmlFor="x">...</Label> ... <SelectTrigger> (no id)
    """
    fixes_applied = 0
    
    # Find all Labels with htmlFor
    label_pattern = r'<Label htmlFor="([^"]+)"[^>]*>.*?</Label>'
    labels = re.findall(label_pattern, content, re.DOTALL)
    
    for label_id in labels:
        # Look for SelectTrigger without id attribute
        trigger_pattern = f'(<SelectTrigger)(?![^>]*id=)([^>]*>)'
        
        # Check if there's a SelectTrigger nearby (within 200 characters) after this label
        label_pos = content.find(f'htmlFor="{label_id}"')
        if label_pos == -1:
            continue
            
        search_area = content[label_pos:label_pos+500]
        if '<SelectTrigger' in search_area and f'id="{label_id}"' not in search_area:
            # Add id to SelectTrigger
            content = re.sub(
                trigger_pattern,
                f'\\1 id="{label_id}"\\2',
                content,
                count=1
            )
            fixes_applied += 1
    
    return content, fixes_applied

def fix_standalone_inputs(content: str) -> Tuple[str, int]:
    """
    Add aria-label to inputs that don't have labels (standalone search/filter inputs).
    """
    fixes_applied = 0
    
    # Pattern: <Input with placeholder but no id and no nearby Label
    pattern = r'<Input\s+(?![^>]*id=)(?![^>]*aria-label=)([^>]*placeholder="([^"]+)"[^>]*)(/?>)'
    
    def replacer(match):
        nonlocal fixes_applied
        attrs = match.group(1)
        placeholder = match.group(2)
        closing = match.group(3)
        
        # Generate aria-label from placeholder
        aria_label = placeholder
        
        fixes_applied += 1
        return f'<Input aria-label="{aria_label}" {attrs}{closing}'
    
    content = re.sub(pattern, replacer, content)
    
    return content, fixes_applied

def fix_file(filepath: str) -> dict:
    """Fix a single file and return statistics"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        content = original_content
        total_fixes = 0
        
        # Apply different fix strategies
        content, label_input_fixes = fix_label_input_pairs(content)
        total_fixes += label_input_fixes
        
        content, select_fixes = fix_select_triggers(content)
        total_fixes += select_fixes
        
        content, standalone_fixes = fix_standalone_inputs(content)
        total_fixes += standalone_fixes
        
        # Only write if changes were made
        if content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                'success': True,
                'fixes': total_fixes,
                'label_input': label_input_fixes,
                'select_triggers': select_fixes,
                'standalone': standalone_fixes
            }
        else:
            return {'success': True, 'fixes': 0}
            
    except Exception as e:
        return {'success': False, 'error': str(e)}

def main():
    """Main execution"""
    print("Accessibility Label Fixer - WCAG 3.3.2 Compliance")
    print("=" * 60)
    print()
    
    total_files = 0
    total_fixes = 0
    failed_files = []
    
    for filepath in PRIORITY_FILES:
        if not Path(filepath).exists():
            print(f"⚠️  SKIP: {Path(filepath).name} (file not found)")
            continue
        
        print(f"Processing: {Path(filepath).name}...")
        result = fix_file(filepath)
        
        if result['success']:
            if result['fixes'] > 0:
                print(f"  ✅ Fixed {result['fixes']} issues")
                if result.get('label_input'):
                    print(f"     - Label/Input pairs: {result['label_input']}")
                if result.get('select_triggers'):
                    print(f"     - Select triggers: {result['select_triggers']}")
                if result.get('standalone'):
                    print(f"     - Standalone inputs: {result['standalone']}")
                total_fixes += result['fixes']
            else:
                print(f"  ℹ️  No issues found (already compliant)")
            total_files += 1
        else:
            print(f"  ❌ ERROR: {result['error']}")
            failed_files.append(Path(filepath).name)
    
    print()
    print("=" * 60)
    print(f"Summary:")
    print(f"  Files processed: {total_files}")
    print(f"  Total fixes applied: {total_fixes}")
    print(f"  Failed files: {len(failed_files)}")
    
    if failed_files:
        print(f"\nFailed files:")
        for f in failed_files:
            print(f"  - {f}")
    
    print("\n✅ Accessibility fixes completed!")
    print("\nNext steps:")
    print("  1. Review changes with: git diff")
    print("  2. Test forms to ensure functionality intact")
    print("  3. Run accessibility audit to verify fixes")

if __name__ == '__main__':
    main()
