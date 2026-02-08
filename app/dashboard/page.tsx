"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { CampaignsList } from "@/components/emails/campaigns-list"
import { CampaignForm } from "@/components/emails/campaign-form"
import type { EmailCampaign } from "@/lib/types/email"
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
import { Plus, Mail, Clock, CheckCircle, XCircle } from "lucide-react"

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session, isPending } = authClient.useSession()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut()
    },
    onSuccess: () => {
      router.push("/login")
      router.refresh()
    },
  })

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login")
    }
  }, [session, isPending, router])

  const { data: campaigns, isLoading } = useQuery({
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


  // Calculate stats
  const stats = {
    total: campaigns?.length || 0,
    draft: campaigns?.filter((c) => c.status === "draft").length || 0,
    scheduled: campaigns?.filter((c) => c.status === "scheduled").length || 0,
    sent: campaigns?.filter((c) => c.status === "sent").length || 0,
    failed: campaigns?.filter((c) => c.status === "failed").length || 0,
  }

  if (isPending || isLoading) {
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
    <div className="container mx-auto py-8 space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session.user.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const response = await fetch("/api/emails/test", { method: "GET" })
                const data = await response.json()
                if (data.success) {
                  alert("SMTP connection verified successfully!")
                } else {
                  alert(`SMTP verification failed: ${data.error}\n\nCheck your .env file for SMTP configuration.`)
                }
              } catch (error) {
                alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
              }
            }}
          >
            Test SMTP
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                // In development, we can call without secret
                const response = await fetch("/api/emails/cron", { method: "GET" })
                const data = await response.json()
                if (data.success) {
                  alert(`Cron Result:\nProcessed: ${data.processed || 0}\nSent: ${data.sent || 0}\nFailed: ${data.failed || 0}\n\n${data.message || "Check console for details"}`)
                } else {
                  alert(`Cron Error:\n${data.error || data.message || "Unknown error"}\n\n${data.message || ""}\n\nCheck CRON_SETUP.md for setup instructions.`)
                }
                console.log("Cron result:", data)
              } catch (error) {
                alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
                console.error("Cron test error:", error)
              }
            }}
          >
            Test Cron
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const response = await fetch("/api/emails/cron/check", { method: "GET" })
                const data = await response.json()
                const diagnostics = data.diagnostics
                const message = `Cron Configuration Check:\n\n` +
                  `Environment: ${diagnostics.environment}\n` +
                  `CRON_SECRET Configured: ${diagnostics.cronSecretConfigured ? "Yes" : "No"}\n` +
                  `CRON_SECRET Length: ${diagnostics.cronSecretLength}\n` +
                  `Auth Header Present: ${diagnostics.authHeaderPresent ? "Yes" : "No"}\n\n` +
                  (diagnostics.recommendations.length > 0 
                    ? `Recommendations:\n${diagnostics.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}`
                    : "✅ Configuration looks good!")
                alert(message)
                console.log("Cron diagnostics:", diagnostics)
              } catch (error) {
                alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
              }
            }}
          >
            Check Cron Config
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Email Campaign</DialogTitle>
                <DialogDescription>
                  Create a new promotional email campaign
                </DialogDescription>
              </DialogHeader>
              <CampaignForm
                onSuccess={() => setIsCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <Button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            variant="outline"
          >
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Email Campaigns Section */}
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Email Campaigns</h1>
          <p className="text-muted-foreground mt-2">
            Manage and schedule your promotional email campaigns
          </p>
        </div>
        <CampaignsList />
      </div>
    </div>
  )
}
