#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function backupData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    console.log('\n📦 Backing up Strategic Directives and Backlog...');
    
    try {
        // Backup strategic_directives_v2
        const { data: sds, error: sdError } = await supabase
            .from('strategic_directives_v2')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (sdError) {
            console.error('❌ SD backup error:', sdError.message);
            return;
        }
        
        // Backup strategic_directives_backlog
        const { data: sdBacklog, error: backlogError } = await supabase
            .from('strategic_directives_backlog')
            .select('*')
            .order('sequence_rank');
            
        if (backlogError) {
            console.error('❌ Backlog backup error:', backlogError.message);
        }
        
        // Backup sd_backlog_map
        const { data: sdMap, error: mapError } = await supabase
            .from('sd_backlog_map')
            .select('*');
            
        if (mapError) {
            console.error('❌ Map backup error:', mapError.message);
        }
        
        const backup = {
            timestamp,
            strategic_directives_v2: sds || [],
            strategic_directives_backlog: sdBacklog || [],
            sd_backlog_map: sdMap || [],
            counts: {
                sds: sds?.length || 0,
                backlog: sdBacklog?.length || 0,
                mappings: sdMap?.length || 0
            }
        };
        
        const filename = `backup-${timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(backup, null, 2));
        
        console.log('\n✅ Backup created successfully:');
        console.log(`   - Strategic Directives: ${backup.counts.sds}`);
        console.log(`   - Backlog Items: ${backup.counts.backlog}`);
        console.log(`   - Mappings: ${backup.counts.mappings}`);
        console.log(`   - File: ${filename}\n`);
        
        return backup;
        
    } catch (error) {
        console.error('❌ Backup failed:', error);
        process.exit(1);
    }
}

backupData();