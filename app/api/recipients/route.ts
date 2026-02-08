import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get("search") || ""
    const limit = parseInt(searchParams.get("limit") || "50")

    // Get users from database (for bulk sending)
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
      take: limit,
      orderBy: {
        email: "asc",
      },
    })

    return NextResponse.json({
      data: users.map((user) => ({
        recipientEmail: user.email,
        recipientName: user.name,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch recipients" },
      { status: 500 }
    )
  }
}
