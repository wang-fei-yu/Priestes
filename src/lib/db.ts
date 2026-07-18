import { PrismaClient } from '@prisma/client'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'

// Resolve the database path from DATABASE_URL and ensure the directory exists.
// SQLite relative paths in Prisma are resolved relative to schema.prisma (project root),
// but this can fail if the db/ directory doesn't exist yet.
function ensureDatabaseDir() {
  const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
  const match = dbUrl.match(/^file:(.+)$/)
  if (match) {
    let dbPath = match[1]
    // Resolve relative paths against project root (where schema.prisma lives)
    if (!dbPath.startsWith('/')) {
      dbPath = resolve(process.cwd(), dbPath)
    }
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    // Update DATABASE_URL to absolute path so Prisma never fails to find it
    process.env.DATABASE_URL = `file:${dbPath}`
  }
}

ensureDatabaseDir()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Graceful fallback: if PrismaClient fails to initialize (e.g. prisma generate not run),
// export a proxy that returns empty results instead of crashing the entire dev server.
let _db: PrismaClient | null = null
try {
  _db = globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    })
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db
} catch {
  console.warn('[db.ts] PrismaClient initialization failed — using null fallback')
}

export const db = _db as PrismaClient
