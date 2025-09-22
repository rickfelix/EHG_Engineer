"use strict";
/**
 * Database Loader Orchestrator (TypeScript version)
 * Main entry point that coordinates all database operations
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseLoader = void 0;
exports.parseFlags = parseFlags;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const connections_1 = __importDefault(require("./connections"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../..', '.env') });
/**
 * DatabaseLoader class - maintains original API with TypeScript types
 */
class DatabaseLoader {
    constructor() {
        this.supabase = null;
        this.isConnected = false;
        this.connectionManager = new connections_1.default();
        this.initializeSupabase();
    }
    initializeSupabase() {
        this.connectionManager.initializeSupabase();
        this.supabase = this.connectionManager.getClient();
        this.isConnected = this.connectionManager.isConnected();
    }
    // Strategic Directives methods
    async loadStrategicDirectives(options = {}) {
        const { dryRun = false } = options;
        if (dryRun) {
            console.log('[dry-run] Would load strategic directives from database');
            return { count: 0, data: [] };
        }
        if (!this.supabase) {
            throw new Error('Database not connected');
        }
        const { data, error } = await this.supabase
            .from('strategic_directives_v2')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return { count: data?.length || 0, data: data || [] };
    }
    async loadPRDs(options = {}) {
        const { dryRun = false } = options;
        if (dryRun) {
            console.log('[dry-run] Would load PRDs from database');
            return { count: 0, data: [] };
        }
        if (!this.supabase) {
            throw new Error('Database not connected');
        }
        const { data, error } = await this.supabase
            .from('prds')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return { count: data?.length || 0, data: data || [] };
    }
}
exports.DatabaseLoader = DatabaseLoader;
// Helper to parse CLI flags
function parseFlags(argv = process.argv.slice(2)) {
    return { dryRun: argv.includes('--dry-run') };
}
exports.default = DatabaseLoader;
//# sourceMappingURL=index.js.map