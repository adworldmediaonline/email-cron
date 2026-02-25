"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"
import Link from "next/link"

export default function TestEmailPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("<p>Hello, this is a test email from Resend.</p>")
  const [isSending, setIsSending] = useState(false)
  const [config, setConfig] = useState<{
    apiKey: string
    fromEmail: string
    fromName: string
  } | null>(null)

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login")
    }
  }, [session, isPending, router])

  useEffect(() => {
    if (!session?.user) return
    fetch("/api/emails/test")
      .then((res) => res.json())
      .then((data) => {
        if (data.config) setConfig(data.config)
      })
      .catch(() => {})
  }, [session?.user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error("Fill in To, Subject, and Body")
      return
    }
    setIsSending(true)
    try {
      const res = await fetch("/api/emails/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), html: body }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.details || data.error || "Failed to send")
        return
      }
      toast.success("Email sent successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setIsSending(false)
    }
  }

  if (isPending || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container max-w-lg py-10">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test Resend</CardTitle>
          <CardDescription>
            Send a basic email to verify Resend is working. No campaigns or cron involved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {config && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-muted-foreground">Current config</p>
              <p>API key: {config.apiKey}</p>
              <p>From: {config.fromName} &lt;{config.fromEmail}&gt;</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                required
                disabled={isSending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Test email"
                required
                disabled={isSending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Body (HTML)</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="<p>Your message here</p>"
                rows={6}
                className="font-mono text-sm"
                required
                disabled={isSending}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSending}>
              {isSending ? "Sending..." : "Send test email"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
