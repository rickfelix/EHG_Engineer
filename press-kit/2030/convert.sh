#!/bin/bash

# EHG Digital Press Kit - Conversion Script
# Converts Markdown files to Microsoft Office formats using Pandoc
# Requires: Pandoc installed (https://pandoc.org/installing.html)

echo "========================================="
echo "EHG Digital Press Kit Converter"
echo "September 15, 2030"
echo "========================================="
echo ""

# Check if Pandoc is installed
if ! command -v pandoc &> /dev/null; then
    echo "Error: Pandoc is not installed."
    echo "Please install Pandoc from: https://pandoc.org/installing.html"
    echo ""
    echo "Quick install commands:"
    echo "  macOS:   brew install pandoc"
    echo "  Ubuntu:  sudo apt-get install pandoc"
    echo "  Windows: Download installer from pandoc.org"
    exit 1
fi

# Set working directory to script location
cd "$(dirname "$0")"

echo "Converting press kit to Word document..."
echo "----------------------------------------"

# Convert the full press kit to DOCX with nice formatting
pandoc EHG_Press_Kit_2030.md \
    -o EHG_Press_Kit_2030.docx \
    --reference-doc=reference.docx \
    --metadata title="ExecHoldings Global Digital Press Kit" \
    --metadata author="ExecHoldings Global" \
    --metadata date="September 15, 2030" \
    --toc \
    --toc-depth=2 \
    2>/dev/null || pandoc EHG_Press_Kit_2030.md -o EHG_Press_Kit_2030.docx

if [ -f "EHG_Press_Kit_2030.docx" ]; then
    echo "✓ Word document created: EHG_Press_Kit_2030.docx"
else
    echo "✗ Failed to create Word document"
fi

echo ""
echo "Converting slide deck to PowerPoint..."
echo "----------------------------------------"

# Convert the slide deck to PPTX
pandoc deck.md \
    -o EHG_Digital_Press_Kit_2030.pptx \
    --slide-level=1 \
    --reference-doc=reference.pptx \
    2>/dev/null || pandoc deck.md -o EHG_Digital_Press_Kit_2030.pptx --slide-level=1

if [ -f "EHG_Digital_Press_Kit_2030.pptx" ]; then
    echo "✓ PowerPoint created: EHG_Digital_Press_Kit_2030.pptx"
else
    echo "✗ Failed to create PowerPoint"
fi

echo ""
echo "Optional: Creating PDF versions..."
echo "----------------------------------------"

# Create PDF versions (requires LaTeX for best results)
if command -v pdflatex &> /dev/null; then
    pandoc EHG_Press_Kit_2030.md -o EHG_Press_Kit_2030.pdf \
        --pdf-engine=pdflatex \
        --toc \
        2>/dev/null && echo "✓ PDF document created: EHG_Press_Kit_2030.pdf" || echo "✗ Failed to create PDF document"

    pandoc deck.md -o EHG_Digital_Press_Kit_2030.pdf \
        -t beamer \
        --pdf-engine=pdflatex \
        2>/dev/null && echo "✓ PDF slides created: EHG_Digital_Press_Kit_2030.pdf" || echo "✗ Failed to create PDF slides"
else
    echo "⚠ LaTeX not installed - skipping PDF generation"
    echo "  To enable PDF: Install TeX Live or MiKTeX"
fi

echo ""
echo "========================================="
echo "Conversion Complete!"
echo "========================================="
echo ""
echo "Files created:"
echo "  📄 EHG_Press_Kit_2030.docx - Full press kit document"
echo "  📊 EHG_Digital_Press_Kit_2030.pptx - Presentation slides"
echo ""
echo "Next steps:"
echo "1. Open the files in Microsoft Office"
echo "2. Apply any custom branding/templates"
echo "3. Add images and charts as needed"
echo ""

# Make the script executable
chmod +x convert.sh 2>/dev/null

exit 0