import 'dotenv/config'
import { prisma } from '../lib/db'

async function main() {
  const post = await prisma.post.create({
    data: {
      title: 'Hello World',
      content: 'This is my first post!',
    },
  })

  console.log('Created post:', post)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
