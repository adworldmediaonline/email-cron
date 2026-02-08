"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { EmailTable } from "@/components/emails/email-table"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import type { EmailCampaign } from "@/lib/types/email"

export default function EmailsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session, isPending: sessionPending } = authClient.useSession()

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/login")
    }
  }, [session, sessionPending, router])

  const { data, isLoading } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: async () => {
      const response = await fetch("/api/emails")
      if (!response.ok) {
        throw new Error("Failed to fetch campaigns")
      }
      const result = await response.json()
      return result.data as EmailCampaign[]
    },
    enabled: !!session?.user,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/emails/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error("Failed to delete campaign")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
    },
  })

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/emails/${id}/send`, {
        method: "POST",
      })
      if (!response.ok) {
        throw new Error("Failed to send email")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
    },
  })

  const handleEdit = (campaign: EmailCampaign) => {
    router.push(`/emails/${campaign.id}`)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this campaign?")) {
      deleteMutation.mutate(id)
    }
  }

  const handleSend = async (id: string) => {
    if (confirm("Send this email now?")) {
      sendMutation.mutate(id)
    }
  }

  if (sessionPending || isLoading) {
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
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Campaigns</CardTitle>
              <CardDescription>Manage your promotional emails</CardDescription>
            </div>
            <Button onClick={() => router.push("/emails/new")}>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <EmailTable
            data={data || []}
            onEdit={handleEdit}
            onSend={handleSend}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
    </div>
  )
}
