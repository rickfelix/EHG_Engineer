"use strict";
/**
 * Connection Manager for Database Operations (TypeScript version)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../..', '.env') });
class ConnectionManager {
    constructor(config = {}) {
        this.supabase = null;
        this.isReady = false;
        const supabaseUrl = config.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = config.supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
            this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
            this.isReady = true;
        }
    }
    initializeSupabase() {
        if (!this.supabase) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (supabaseUrl && supabaseKey) {
                this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
                this.isReady = true;
                console.log('✅ Database connection established');
            }
            else {
                console.error('❌ Missing Supabase credentials');
            }
        }
    }
    getClient() {
        return this.supabase;
    }
    isConnected() {
        return this.isReady;
    }
}
exports.ConnectionManager = ConnectionManager;
exports.default = ConnectionManager;
//# sourceMappingURL=connections.js.map