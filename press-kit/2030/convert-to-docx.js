#!/usr/bin/env node

/**
 * Alternative DOCX converter using Node.js
 * Converts Markdown to Word document without Pandoc
 */

import fs from 'fs';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';

// Read the markdown content
const markdownContent = fs.readFileSync('EHG_Press_Kit_2030.md', 'utf8');

// Parse markdown sections
const sections = markdownContent.split('\n## ').slice(1);
const title = markdownContent.split('\n## ')[0].replace(/# /g, '').trim();

// Create document
const doc = new Document({
    creator: "ExecHoldings Global",
    title: "ExecHoldings Global Digital Press Kit",
    description: "September 15, 2030 - World's First AI-Native Holding Company",
    sections: [{
        properties: {},
        children: [
            // Title Page
            new Paragraph({
                text: "ExecHoldings Global",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            new Paragraph({
                text: "Digital Press Kit",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "September 15, 2030",
                alignment: AlignmentType.CENTER,
                spacing: { after: 600 }
            }),

            // Process each section
            ...sections.flatMap(section => {
                const lines = section.split('\n');
                const sectionTitle = lines[0].trim();
                const sectionContent = lines.slice(1).join('\n');

                const paragraphs = [
                    new Paragraph({
                        text: sectionTitle,
                        heading: HeadingLevel.HEADING_1,
                        spacing: { before: 400, after: 200 }
                    })
                ];

                // Process section content
                sectionContent.split('\n\n').forEach(para => {
                    if (para.trim()) {
                        // Check for subsection (### )
                        if (para.startsWith('### ')) {
                            paragraphs.push(new Paragraph({
                                text: para.replace('### ', ''),
                                heading: HeadingLevel.HEADING_2,
                                spacing: { before: 200, after: 100 }
                            }));
                        }
                        // Check for bullet points
                        else if (para.includes('\n- ')) {
                            para.split('\n- ').filter(p => p).forEach(bulletPoint => {
                                paragraphs.push(new Paragraph({
                                    text: bulletPoint.replace('- ', ''),
                                    bullet: { level: 0 },
                                    spacing: { after: 50 }
                                }));
                            });
                        }
                        // Check for quotes (> )
                        else if (para.startsWith('>')) {
                            paragraphs.push(new Paragraph({
                                text: para.replace(/>/g, '').trim(),
                                spacing: { before: 100, after: 100 },
                                children: [
                                    new TextRun({
                                        text: para.replace(/>/g, '').trim(),
                                        italics: true
                                    })
                                ]
                            }));
                        }
                        // Regular paragraph
                        else {
                            paragraphs.push(new Paragraph({
                                text: para.trim(),
                                spacing: { after: 100 }
                            }));
                        }
                    }
                });

                return paragraphs;
            })
        ]
    }]
});

// Generate and save the document
Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("EHG_Press_Kit_2030.docx", buffer);
    console.log("✅ Word document created: EHG_Press_Kit_2030.docx");
}).catch(err => {
    console.error("❌ Error creating document:", err);
});