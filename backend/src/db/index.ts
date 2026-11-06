import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { newDb, IMemoryDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let pool: Pool | null = null;
let memoryDb: IMemoryDb | null = null;
let memoryAdapter: any = null;

export interface IDbClient {
    query<R extends QueryResultRow = any, I extends any[] = any[]>(
        queryText: string,
        values?: I
    ): Promise<QueryResult<R>>;
    release?: () => void;
}

export interface IDbPool {
    query<R extends QueryResultRow = any, I extends any[] = any[]>(
        queryText: string,
        values?: I
    ): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
}

export function isUsingMemoryDb(): boolean {
    return memoryDb !== null;
}

export function initializeDatabase(): { query: IDbPool['query']; connect: IDbPool['connect'] } {
    const connectionString = process.env.DATABASE_URL;

    if (connectionString && !process.env.FORCE_MEMORY_DB) {
        console.log('[DB] Connecting to PostgreSQL database via DATABASE_URL...');
        pool = new Pool({
            connectionString,
            ssl: process.env.NODE_ENV === 'production' || connectionString.includes('neon') || connectionString.includes('supabase')
                ? { rejectUnauthorized: false }
                : undefined,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        return {
            query: (text: string, params?: any[]) => pool!.query(text, params),
            connect: () => pool!.connect(),
        };
    } else {
        console.log('[DB] Initializing embedded in-memory PostgreSQL engine (pg-mem)...');
        memoryDb = newDb();

        // Register custom functions needed by schema
        memoryDb.public.registerFunction({
            name: 'gen_random_uuid',
            returns: memoryDb.public.getType('text' as any),
            implementation: () => crypto.randomUUID(),
        });

        memoryAdapter = memoryDb.adapters.createPg();
        const memPool = new memoryAdapter.Pool();

        // Load and execute schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
            // Execute table definitions cleanly in pg-mem
            const statements = schemaSql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.includes('CREATE OR REPLACE FUNCTION') && !s.includes('CREATE TRIGGER') && !s.includes('DROP TRIGGER'));
            
            for (const statement of statements) {
                try {
                    memoryDb.public.none(statement);
                } catch (e: any) {
                    // ignore if already created
                }
            }
        }

        return {
            query: (text: string, params?: any[]) => memPool.query(text, params),
            connect: () => memPool.connect(),
        };
    }
}

export const db = initializeDatabase();
