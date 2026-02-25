"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { EmailForm } from "@/components/emails/email-form"
import type { CreateEmailCampaignInput } from "@/lib/validations/email-schema"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"

export default function EditEmailPage() {
  const router = useRouter()
  const params = useParams()
  const queryClient = useQueryClient()
  const campaignId = params.id as string
  const { data: session, isPending: sessionPending } = authClient.useSession()

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/login")
    }
  }, [session, sessionPending, router])

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["email-campaign", campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/emails/${campaignId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch campaign")
      }
      const result = await response.json()
      return result.data
    },
    enabled: !!session?.user && !!campaignId,
  })

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/emails/${campaignId}/duplicate`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to duplicate campaign")
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      toast.success("Campaign duplicated")
      router.push(`/emails/${data.data.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to duplicate campaign")
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: CreateEmailCampaignInput) => {
      const response = await fetch(`/api/emails/${campaignId}`, {
        method: "PUT",
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
        throw new Error(error.error || "Failed to update campaign")
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      queryClient.invalidateQueries({ queryKey: ["email-campaign", campaignId] })
      router.push("/emails")
    },
  })

  const handleSubmit = async (data: CreateEmailCampaignInput) => {
    await updateMutation.mutateAsync(data)
  }

  if (sessionPending || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!session?.user || !campaign) {
    return null
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Edit Email Campaign</CardTitle>
              <CardDescription>Update your email campaign</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending}
            >
              {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <EmailForm
            onSubmit={handleSubmit}
            defaultValues={{
              subject: campaign.subject,
              body: campaign.body,
              recipients: campaign.recipients?.map((r: { recipientEmail: string }) => ({
                recipientEmail: r.recipientEmail,
              })) || [],
              scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt) : null,
            }}
            isLoading={updateMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  )
}
