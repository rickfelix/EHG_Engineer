/**
 * Connection Manager for Database Operations (TypeScript version)
 */
import { SupabaseClient } from '@supabase/supabase-js';
export interface ConnectionConfig {
    supabaseUrl?: string;
    supabaseKey?: string;
    serviceRoleKey?: string;
}
export declare class ConnectionManager {
    private supabase;
    private isReady;
    constructor(config?: ConnectionConfig);
    initializeSupabase(): void;
    getClient(): SupabaseClient | null;
    isConnected(): boolean;
}
export default ConnectionManager;
//# sourceMappingURL=connections.d.ts.map