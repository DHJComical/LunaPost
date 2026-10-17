import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle as drizzleSqliteProxy, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import type { DatabaseSync } from 'node:sqlite'
import { schema } from './schema.js'

export type AppDatabase = DrizzleD1Database<typeof schema>

/** Create the typed query client for a Cloudflare D1 binding. */
export const createD1Database = (binding: D1Database): AppDatabase => drizzle(binding, { schema })

export type AppSqliteDatabase = SqliteRemoteDatabase<typeof schema>

/**
 * Create the local Node SQLite client with the exact same Drizzle schema used
 * by D1. The proxy driver lets us keep Node's built-in synchronous SQLite
 * implementation while exposing Drizzle's async query builder to repositories.
 */
export const createSqliteDatabase = (sqlite: DatabaseSync): AppSqliteDatabase => drizzleSqliteProxy(
  async (sql, params, method) => {
    const statement = sqlite.prepare(sql)
    if (method === 'run') {
      const result = statement.run(...(params as any[]))
      return { rows: [], meta: { changes: Number(result.changes ?? 0), lastInsertRowid: Number(result.lastInsertRowid ?? 0) } }
    }
    // Drizzle's sqlite-proxy mapper consumes positional rows. Node's
    // DatabaseSync defaults to objects, so make the adapter return arrays for
    // every read method (including get, where the single row is itself the
    // response value).
    statement.setReturnArrays(true)
    if (method === 'get') return { rows: statement.get(...(params as any[]) ) as any }
    if (method === 'values') return { rows: statement.all(...(params as any[])) as any }
    return { rows: statement.all(...(params as any[])) as any }
  },
  { schema },
)
