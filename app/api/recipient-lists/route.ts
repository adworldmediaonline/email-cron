import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import * as z from "zod"

const createRecipientListSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  emails: z.array(z.string().email()).min(1, "At least one email is required"),
})

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const lists = await prisma.recipientList.findMany({
      where: { userId: session.user.id },
      include: {
        entries: true,
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({
      data: lists.map((list) => {
        const entries = (list as unknown as { entries: Array<{ recipientEmail: string; recipientName: string | null }> }).entries ?? []
        return {
          id: list.id,
          name: list.name,
          createdAt: list.createdAt,
          entryCount: entries.length,
          entries: entries.map((e) => ({
            recipientEmail: e.recipientEmail,
            recipientName: e.recipientName,
          })),
        }
      }),
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch recipient lists" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validated = createRecipientListSchema.parse(body)

    const list = await prisma.recipientList.create({
      data: {
        name: validated.name,
        userId: session.user.id,
        entries: {
          create: validated.emails.map((email) => ({
            recipientEmail: email,
          })),
        },
      },
      include: {
        entries: true,
      },
    })

    return NextResponse.json(
      {
        data: {
          id: list.id,
          name: list.name,
          createdAt: list.createdAt,
          entries: list.entries.map((e) => ({
            recipientEmail: e.recipientEmail,
            recipientName: e.recipientName,
          })),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create recipient list" },
      { status: 500 }
    )
  }
}
