/**
 * Database Loader Orchestrator (TypeScript version)
 * Main entry point that coordinates all database operations
 */
import { SupabaseClient } from '@supabase/supabase-js';
export interface LoadOptions {
    dryRun?: boolean;
}
export interface LoadResult {
    count: number;
    data: any[];
}
/**
 * DatabaseLoader class - maintains original API with TypeScript types
 */
export declare class DatabaseLoader {
    private connectionManager;
    supabase: SupabaseClient | null;
    isConnected: boolean;
    constructor();
    initializeSupabase(): void;
    loadStrategicDirectives(options?: LoadOptions): Promise<LoadResult>;
    loadPRDs(options?: LoadOptions): Promise<LoadResult>;
}
export declare function parseFlags(argv?: string[]): LoadOptions;
export default DatabaseLoader;
//# sourceMappingURL=index.d.ts.map