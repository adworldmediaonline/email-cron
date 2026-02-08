import 'dotenv/config'
import { prisma } from '../lib/db'

async function main() {
  const post = await prisma.post.create({
    data: {
      title: 'Hello World',
      content: 'This is my first post!',
    },
  })
}

main()
  .catch((e) => {
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
