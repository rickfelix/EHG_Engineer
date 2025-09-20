#!/usr/bin/env node

/**
 * EHG Digital Press Kit - PowerPoint Generator
 * Creates a branded PowerPoint presentation using PptxGenJS
 * September 15, 2030
 */

import PptxGenJS from 'pptxgenjs';
import fs from 'fs';
import path from 'path';

// Create new presentation
const pptx = new PptxGenJS();

// Set presentation properties
pptx.author = 'ExecHoldings Global';
pptx.company = 'EHG';
pptx.title = 'ExecHoldings Global Digital Press Kit 2030';
pptx.subject = 'AI-Native Business Revolution';

// Define color scheme
const colors = {
    primary: '0A2540',      // Deep Tech Blue
    secondary: '00FF88',    // AI Green
    accent: 'FFD700',       // Future Gold
    dark: '333333',
    light: 'F5F5F5',
    white: 'FFFFFF'
};

// Define master slide layouts
pptx.defineSlideMaster({
    title: 'EHG_MASTER',
    background: { color: colors.white },
    objects: [
        {
            rect: {
                x: 0, y: 0, w: '100%', h: '8%',
                fill: { color: colors.primary }
            }
        },
        {
            text: {
                text: 'EHG',
                options: {
                    x: 0.5, y: 0.2, w: 1, h: 0.5,
                    fontSize: 18, color: colors.secondary, bold: true
                }
            }
        }
    ],
    slideNumber: { x: 0.5, y: '95%', color: colors.dark }
});

// Slide 1: Title Slide
let slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('ExecHoldings Global', {
    x: 0.5, y: 1.5, w: 9, h: 1,
    fontSize: 44, bold: true, color: colors.primary, align: 'center'
});
slide.addText('The AI-Native Future of Business', {
    x: 0.5, y: 2.5, w: 9, h: 0.5,
    fontSize: 24, color: colors.dark, align: 'center'
});
slide.addText("World's First $100M ARR Autonomous Venture Portfolio", {
    x: 0.5, y: 3.5, w: 9, h: 0.5,
    fontSize: 20, color: colors.secondary, align: 'center'
});
slide.addText('September 15, 2030', {
    x: 0.5, y: 5, w: 9, h: 0.5,
    fontSize: 16, color: colors.dark, align: 'center'
});

// Slide 2: Chairman's Journey
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText("From Vision to Revolution: The Chairman's Journey", {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

const timeline = [
    { year: '2025', title: 'Solo Founder', desc: 'Building EVA v1.0, LEO Protocol conception' },
    { year: '2026', title: 'First Success', desc: '5 ventures launched, $1M ARR achieved' },
    { year: '2027', title: 'Scaling Proof', desc: '15 ventures, EVA Level 3 autonomy' },
    { year: '2028', title: 'Acceleration', desc: '30 ventures, Master orchestrator status' },
    { year: '2029', title: 'Market Leader', desc: 'First $15M exit, International expansion' },
    { year: '2030', title: 'Global Impact', desc: '50+ ventures, $100M+ ARR' }
];

timeline.forEach((item, index) => {
    const y = 1.5 + (index * 0.6);
    slide.addText(item.year, {
        x: 0.5, y: y, w: 1, h: 0.5,
        fontSize: 14, bold: true, color: colors.secondary
    });
    slide.addText(`${item.title}: ${item.desc}`, {
        x: 1.7, y: y, w: 7, h: 0.5,
        fontSize: 12, color: colors.dark
    });
});

slide.addText('"I don\'t manage operations; I govern outcomes."', {
    x: 1, y: 5, w: 8, h: 0.5,
    fontSize: 16, italic: true, color: colors.primary, align: 'center'
});

// Slide 3: EVA Evolution
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('EVA: From Assistant to Autonomous Orchestrator', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

const evolution = [
    { stage: 'Assistant', year: '2025', automation: '10%' },
    { stage: 'Orchestrator', year: '2026', automation: '40%' },
    { stage: 'Master Orchestrator', year: '2028', automation: '75%' },
    { stage: 'Autonomous Agent', year: '2030', automation: '95%' }
];

// Create evolution chart
const chartData = [
    { name: 'Automation Level', labels: evolution.map(e => e.year), values: [10, 40, 75, 95] }
];

slide.addChart('line', chartData, {
    x: 1, y: 2, w: 8, h: 3,
    showLegend: false,
    showTitle: true,
    title: 'Automation Progression',
    lineSize: 3,
    lineColor: colors.secondary
});

// Slide 4: Portfolio Overview
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('50+ Ventures, Infinite Possibilities', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

// Metrics grid
const metrics = [
    ['52', 'Total Ventures'],
    ['$109.2M', 'Combined ARR'],
    ['73%', 'Success Rate'],
    ['$2.1M', 'Avg Venture ARR'],
    ['87 days', 'Time to Profit'],
    ['78%', 'Cost Reduction']
];

metrics.forEach((metric, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 1 + (col * 3);
    const y = 2 + (row * 1.5);

    slide.addText(metric[0], {
        x: x, y: y, w: 2.5, h: 0.6,
        fontSize: 24, bold: true, color: colors.secondary, align: 'center'
    });
    slide.addText(metric[1], {
        x: x, y: y + 0.6, w: 2.5, h: 0.4,
        fontSize: 12, color: colors.dark, align: 'center'
    });
});

// Slide 5: LEO Protocol
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('The LEO Protocol: 40 Stages to Success', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

const stages = [
    { phase: 'Ideation & Validation', stages: 'Stages 1-5', color: colors.secondary },
    { phase: 'Development & Building', stages: 'Stages 6-20', color: colors.primary },
    { phase: 'Growth & Scaling', stages: 'Stages 21-35', color: colors.accent },
    { phase: 'Maturity & Evolution', stages: 'Stages 36-40', color: colors.dark }
];

stages.forEach((stage, index) => {
    const y = 2 + (index * 0.8);
    slide.addShape('rect', {
        x: 1, y: y, w: 8, h: 0.6,
        fill: { color: stage.color },
        line: { color: stage.color }
    });
    slide.addText(`${stage.phase} (${stage.stages})`, {
        x: 1.2, y: y + 0.1, w: 7.5, h: 0.4,
        fontSize: 14, color: colors.white, bold: true
    });
});

// Slide 6: TechCrunch Feature
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('Breaking: EHG Surpasses $100M ARR', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

slide.addText(
    '"They\'ve demonstrated that AI-native governance isn\'t a futuristic concept; ' +
    'it\'s a present reality with proven results."',
    {
        x: 1, y: 1.5, w: 8, h: 1,
        fontSize: 16, italic: true, color: colors.dark, align: 'center'
    }
);

slide.addText('— Dr. Jennifer Martinez, Stanford AI Business Lab', {
    x: 1, y: 2.5, w: 8, h: 0.5,
    fontSize: 14, color: colors.dark, align: 'center'
});

const achievements = [
    '✓ First $100M ARR with AI management',
    '✓ New venture every 18 days',
    '✓ 10x industry average success rate',
    '✓ 78% operational cost reduction'
];

achievements.forEach((achievement, index) => {
    slide.addText(achievement, {
        x: 1.5, y: 3.5 + (index * 0.5), w: 7, h: 0.4,
        fontSize: 14, color: colors.dark
    });
});

// Slide 7: Award
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('AI Venture Innovator of the Year 2030', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary, align: 'center'
});

slide.addShape('star', {
    x: 4, y: 1.5, w: 2, h: 2,
    fill: { color: colors.accent }
});

slide.addText('🏆', {
    x: 4.5, y: 2, w: 1, h: 1,
    fontSize: 48, align: 'center'
});

const citations = [
    'Extraordinary achievement in AI-native governance',
    '95% orchestration accuracy',
    'Blueprint for 21st century corporations',
    '$500M+ combined portfolio valuation'
];

citations.forEach((citation, index) => {
    slide.addText(`• ${citation}`, {
        x: 1.5, y: 4 + (index * 0.4), w: 7, h: 0.3,
        fontSize: 14, color: colors.dark
    });
});

// Slide 8: Testimonial
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('Industry Leaders Recognize the Revolution', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

slide.addText('Dr. Aris Thorne', {
    x: 1, y: 1.5, w: 8, h: 0.5,
    fontSize: 20, bold: true, color: colors.secondary, align: 'center'
});

slide.addText('AI Governance Scholar, Oxford Future of Humanity Institute', {
    x: 1, y: 2, w: 8, h: 0.4,
    fontSize: 14, italic: true, color: colors.dark, align: 'center'
});

slide.addText(
    '"Rick\'s vision with ExecHoldings Global has proven that AI-native governance ' +
    'is not just possible—it\'s inevitable. By coupling EVA\'s orchestration with ' +
    'a human Chairman\'s ethical oversight, he has created the blueprint for the ' +
    'corporations of the 21st century."',
    {
        x: 1, y: 2.8, w: 8, h: 1.5,
        fontSize: 14, italic: true, color: colors.dark, align: 'center'
    }
);

// Slide 9: Future Vision
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('Constitutional Governance: The New Model', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary
});

// Governance hierarchy
slide.addShape('rect', {
    x: 3.5, y: 1.5, w: 3, h: 0.8,
    fill: { color: colors.primary }
});
slide.addText('Chairman (Rick)', {
    x: 3.5, y: 1.7, w: 3, h: 0.4,
    fontSize: 14, bold: true, color: colors.white, align: 'center'
});

slide.addShape('rect', {
    x: 3.5, y: 2.7, w: 3, h: 0.8,
    fill: { color: colors.secondary }
});
slide.addText('EVA', {
    x: 3.5, y: 2.9, w: 3, h: 0.4,
    fontSize: 14, bold: true, color: colors.white, align: 'center'
});

slide.addShape('rect', {
    x: 1, y: 3.9, w: 2.5, h: 0.8,
    fill: { color: colors.light }
});
slide.addText('AI CEO 1', {
    x: 1, y: 4.1, w: 2.5, h: 0.4,
    fontSize: 12, color: colors.dark, align: 'center'
});

slide.addShape('rect', {
    x: 3.75, y: 3.9, w: 2.5, h: 0.8,
    fill: { color: colors.light }
});
slide.addText('AI CEO 2', {
    x: 3.75, y: 4.1, w: 2.5, h: 0.4,
    fontSize: 12, color: colors.dark, align: 'center'
});

slide.addShape('rect', {
    x: 6.5, y: 3.9, w: 2.5, h: 0.8,
    fill: { color: colors.light }
});
slide.addText('AI CEO N', {
    x: 6.5, y: 4.1, w: 2.5, h: 0.4,
    fontSize: 12, color: colors.dark, align: 'center'
});

// Slide 10: Contact
slide = pptx.addSlide({ masterName: 'EHG_MASTER' });
slide.addText('Join the AI-Native Revolution', {
    x: 0.5, y: 0.5, w: 9, h: 0.7,
    fontSize: 28, bold: true, color: colors.primary, align: 'center'
});

const contact = [
    '🌐 www.execholdings.global',
    '📧 press@execholdings.global',
    '💼 LinkedIn: /company/execholdings-global',
    '🐦 @EHG_Future'
];

contact.forEach((item, index) => {
    slide.addText(item, {
        x: 2, y: 2 + (index * 0.5), w: 6, h: 0.4,
        fontSize: 16, color: colors.dark
    });
});

slide.addText(
    'The future of business isn\'t coming—it\'s here.\nBe part of the revolution.',
    {
        x: 1, y: 4.5, w: 8, h: 1,
        fontSize: 18, bold: true, color: colors.secondary, align: 'center'
    }
);

// Save the presentation
pptx.writeFile({ fileName: 'EHG_Digital_Press_Kit_2030.pptx' })
    .then(() => {
        console.log('✅ PowerPoint presentation created successfully!');
        console.log('📊 File saved as: EHG_Digital_Press_Kit_2030.pptx');
    })
    .catch(err => {
        console.error('❌ Error creating presentation:', err);
    });