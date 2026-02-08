"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { EmailForm } from "@/components/emails/email-form"
import type { CreateEmailCampaignInput } from "@/lib/validations/email-schema"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function NewEmailPage() {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = authClient.useSession()

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/login")
    }
  }, [session, sessionPending, router])

  const createMutation = useMutation({
    mutationFn: async (data: CreateEmailCampaignInput) => {
      const response = await fetch("/api/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          scheduledAt: data.scheduledAt?.toISOString() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create campaign")
      }

      return response.json()
    },
    onSuccess: () => {
      router.push("/emails")
    },
  })

  const handleSubmit = async (data: CreateEmailCampaignInput) => {
    await createMutation.mutateAsync(data)
  }

  if (sessionPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Create Email Campaign</CardTitle>
          <CardDescription>Create a new promotional email campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailForm onSubmit={handleSubmit} isLoading={createMutation.isPending} />
        </CardContent>
      </Card>
    </div>
  )
}
