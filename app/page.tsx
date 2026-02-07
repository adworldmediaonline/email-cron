import { ComponentExample } from "@/components/component-example";
import { prisma } from "@/lib/db";


export default async function Page() {
  const posts = await prisma.post.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  return <>
    <ComponentExample />
    {/*  */}
    <pre>{JSON.stringify(posts, null, 2)}</pre>
  </>;
}
