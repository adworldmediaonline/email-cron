import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import * as z from "zod"

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  subject: z.string().min(1, "Subject is required"),
  body: z.string(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const templates = await prisma.emailTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        body: t.body,
        createdAt: t.createdAt,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch templates" },
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
    const validated = createTemplateSchema.parse(body)

    const template = await prisma.emailTemplate.create({
      data: {
        name: validated.name,
        subject: validated.subject,
        body: validated.body,
        userId: session.user.id,
      },
    })

    return NextResponse.json(
      {
        data: {
          id: template.id,
          name: template.name,
          subject: template.subject,
          body: template.body,
          createdAt: template.createdAt,
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
      { error: "Failed to create template" },
      { status: 500 }
    )
  }
}
