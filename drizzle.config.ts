import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env.local' })

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error('Defina DIRECT_URL (ou DATABASE_URL) em .env.local')
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  // O schema `auth` é do Supabase; o drizzle-kit não deve tentar gerenciá-lo.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
