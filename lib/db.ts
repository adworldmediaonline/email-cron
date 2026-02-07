import { PrismaClient } from './generated/prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const DATABASE_URL = process.env.DATABASE_URL

const globalForPrisma = global as unknown as {
  prisma: ReturnType<typeof createPrismaClient>
}

function createPrismaClient() {
  return new PrismaClient({
    accelerateUrl: DATABASE_URL,
  }).$extends(withAccelerate())
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
