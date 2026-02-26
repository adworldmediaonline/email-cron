"use client"

import { useState } from "react"
import { format } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Info } from "lucide-react"

export interface Recipient {
  id: string
  recipientEmail: string
  recipientName: string | null
  status: string
  sentAt: Date | null
  lastEvent: string | null
  errorMessage: string | null
  resendEmailId: string | null
}

interface RecipientsTableProps {
  recipients: Recipient[]
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-500",
  sent: "bg-green-500",
  failed: "bg-red-500",
}

async function fetchRecipientDetails(recipientId: string) {
  const response = await fetch(`/api/emails/recipients/${recipientId}/details`)
  if (!response.ok) {
    throw new Error("Failed to fetch recipient details")
  }
  const result = await response.json()
  return result.data
}

function RecipientDetailsDialog({
  recipientId,
  open,
  onOpenChange,
}: {
  recipientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recipient-details", recipientId],
    queryFn: () => fetchRecipientDetails(recipientId),
    enabled: open && !!recipientId,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Details</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="text-muted-foreground py-4 text-sm">Loading...</div>
        )}
        {error && (
          <div className="text-destructive py-4 text-sm">
            {error instanceof Error ? error.message : "Failed to load details"}
          </div>
        )}
        {data && !isLoading && (
          <div className="space-y-4 text-sm">
            {data.recipient && (
              <div className="space-y-2">
                <h4 className="font-medium">Recipient</h4>
                <dl className="grid gap-1 text-muted-foreground">
                  <div className="flex gap-2">
                    <dt className="min-w-24">Email</dt>
                    <dd>{data.recipient.recipientEmail}</dd>
                  </div>
                  {data.recipient.recipientName && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Name</dt>
                      <dd>{data.recipient.recipientName}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="min-w-24">Status</dt>
                    <dd className="capitalize">{data.recipient.status}</dd>
                  </div>
                  {data.recipient.sentAt && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Sent at</dt>
                      <dd>
                        {format(
                          new Date(data.recipient.sentAt),
                          "PPpp"
                        )}
                      </dd>
                    </div>
                  )}
                  {data.recipient.lastEvent && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Last event</dt>
                      <dd className="capitalize">{data.recipient.lastEvent}</dd>
                    </div>
                  )}
                  {data.recipient.errorMessage && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Error</dt>
                      <dd className="text-destructive">
                        {data.recipient.errorMessage}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {data.resendDetails && (
              <div className="space-y-2">
                <h4 className="font-medium">Resend Details</h4>
                <dl className="grid gap-1 text-muted-foreground">
                  {data.resendDetails.from && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">From</dt>
                      <dd>{data.resendDetails.from}</dd>
                    </div>
                  )}
                  {data.resendDetails.to && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">To</dt>
                      <dd>{data.resendDetails.to}</dd>
                    </div>
                  )}
                  {data.resendDetails.subject && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Subject</dt>
                      <dd>{data.resendDetails.subject}</dd>
                    </div>
                  )}
                  {data.resendDetails.last_event && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Last event</dt>
                      <dd className="capitalize">
                        {String(data.resendDetails.last_event)}
                      </dd>
                    </div>
                  )}
                  {data.resendDetails.created_at && (
                    <div className="flex gap-2">
                      <dt className="min-w-24">Created</dt>
                      <dd>
                        {format(
                          new Date(data.resendDetails.created_at),
                          "PPpp"
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {data.resendError && (
              <div className="text-muted-foreground text-xs">
                Resend API: {data.resendError}
              </div>
            )}
            {data.message && !data.resendDetails && (
              <div className="text-muted-foreground text-xs">{data.message}</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RecipientsTable({ recipients }: RecipientsTableProps) {
  const [detailsRecipientId, setDetailsRecipientId] = useState<string | null>(
    null
  )

  if (!recipients.length) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No recipients yet
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent At</TableHead>
              <TableHead>Last Event</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((recipient) => (
              <TableRow key={recipient.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{recipient.recipientEmail}</div>
                    {recipient.recipientName && (
                      <div className="text-muted-foreground text-xs">
                        {recipient.recipientName}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      statusColors[recipient.status] ?? "bg-gray-500"
                    }
                  >
                    {recipient.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {recipient.sentAt
                    ? format(new Date(recipient.sentAt), "PPp")
                    : "-"}
                </TableCell>
                <TableCell>
                  {recipient.lastEvent ? (
                    <span className="capitalize">{recipient.lastEvent}</span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  {recipient.resendEmailId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailsRecipientId(recipient.id)}
                      className="h-8 px-2"
                    >
                      <Info className="h-4 w-4" />
                      <span className="sr-only">View details</span>
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {detailsRecipientId && (
        <RecipientDetailsDialog
          recipientId={detailsRecipientId}
          open={!!detailsRecipientId}
          onOpenChange={(open) => !open && setDetailsRecipientId(null)}
        />
      )}
    </>
  )
}
