"use client"

import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useState } from "react"
import { format } from "date-fns"
import { formatInTimezone } from "@/lib/utils/timezone"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RefreshCw, ChevronDown, ChevronRight, Trash2 } from "lucide-react"
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { RecipientsTable } from "@/components/emails/recipients-table"
import type { EmailCampaign } from "@/lib/types/email"

type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed"

interface Campaign {
  id: string
  subject: string
  status: CampaignStatus
  scheduledAt: Date | null
  scheduledTimezone: string | null
  sentAt: Date | null
  createdAt: Date
  recipients: {
    id: string
    status: string
    recipientEmail?: string
    recipientName?: string | null
    sentAt?: Date | null
    lastEvent?: string | null
    errorMessage?: string | null
    resendEmailId?: string | null
  }[]
}

const statusColors: Record<CampaignStatus, string> = {
  draft: "bg-gray-500",
  scheduled: "bg-blue-500",
  sending: "bg-yellow-500",
  sent: "bg-green-500",
  failed: "bg-red-500",
}

async function fetchCampaigns(): Promise<Campaign[]> {
  const response = await fetch("/api/emails")
  if (!response.ok) {
    throw new Error("Failed to fetch campaigns")
  }
  const data = await response.json()
  return data.data
}

async function fetchCampaignById(id: string) {
  const response = await fetch(`/api/emails/${id}`)
  if (!response.ok) {
    throw new Error("Failed to fetch campaign")
  }
  const result = await response.json()
  return result.data
}

function CampaignRecipientsRow({ campaignId }: { campaignId: string }) {
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["email-campaign", campaignId],
    queryFn: () => fetchCampaignById(campaignId),
    enabled: !!campaignId,
  })

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Loading recipients...
      </div>
    )
  }

  const recipients =
    campaign?.recipients?.map(
      (r: {
        id: string
        recipientEmail: string
        recipientName: string | null
        status: string
        sentAt: Date | null
        lastEvent: string | null
        errorMessage: string | null
        resendEmailId: string | null
      }) => ({
        id: r.id,
        recipientEmail: r.recipientEmail,
        recipientName: r.recipientName,
        status: r.status,
        sentAt: r.sentAt,
        lastEvent: r.lastEvent,
        errorMessage: r.errorMessage,
        resendEmailId: r.resendEmailId,
      })
    ) ?? []

  return <RecipientsTable recipients={recipients} />
}

async function deleteCampaign(id: string): Promise<void> {
  const response = await fetch(`/api/emails/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error("Failed to delete campaign")
  }
}

async function bulkDeleteCampaigns(ids: string[]): Promise<void> {
  const results = await Promise.allSettled(
    ids.map((id) =>
      fetch(`/api/emails/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete")
      })
    )
  )
  const failed = results.filter((r) => r.status === "rejected").length
  if (failed > 0) {
    throw new Error(`${failed} campaign(s) could not be deleted`)
  }
}

async function duplicateCampaign(id: string): Promise<{ data: { id: string } }> {
  const response = await fetch(`/api/emails/${id}/duplicate`, {
    method: "POST",
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to duplicate campaign")
  }
  return response.json()
}

async function sendCampaign(id: string): Promise<void> {
  const response = await fetch(`/api/emails/${id}/send`, {
    method: "POST",
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to send campaign")
  }
}

async function processScheduledCampaigns(): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const response = await fetch("/api/emails/cron", {
    method: "GET",
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to process scheduled campaigns")
  }
  return response.json()
}

export function CampaignsList() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null)
  const [sendDialogOpen, setSendDialogOpen] = useState<string | null>(null)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(
    null
  )

  const {
    data: campaigns = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: fetchCampaigns,
    // Refetch when window regains focus (user returns to tab)
    refetchOnWindowFocus: true,
    // Refetch when reconnecting to network
    refetchOnReconnect: true,
    // Refetch when component mounts (when navigating to page)
    refetchOnMount: true,
  })

  // Check if there are any scheduled campaigns ready to send
  const hasScheduledCampaigns = campaigns.some(
    (campaign) =>
      campaign.status === "scheduled" &&
      campaign.scheduledAt &&
      new Date(campaign.scheduledAt) <= new Date()
  )

  const sendMutation = useMutation({
    mutationFn: sendCampaign,
    onSuccess: () => {
      // Invalidate and refetch immediately for instant feedback
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      refetch()
      toast.success("Campaign sent successfully")
      setSendDialogOpen(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send campaign")
    },
  })

  const processScheduledMutation = useMutation({
    mutationFn: processScheduledCampaigns,
    onSuccess: (data) => {
      // Invalidate and refetch immediately for instant feedback
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      refetch()
      toast.success(
        `Processed ${data.processed} campaign(s): ${data.sent} sent, ${data.failed} failed`
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to process scheduled campaigns")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      refetch()
      toast.success("Campaign deleted successfully")
      setDeleteDialogOpen(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete campaign")
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteCampaigns,
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      refetch()
      setRowSelection({})
      setBulkDeleteDialogOpen(false)
      toast.success(`${ids.length} campaign(s) deleted successfully`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete campaigns")
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateCampaign,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      refetch()
      toast.success("Campaign duplicated")
      router.push(`/emails/${data.data.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to duplicate campaign")
    },
  })

  const columns: ColumnDef<Campaign>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      id: "expand",
      header: "",
      cell: ({ row }) => {
        const campaign = row.original
        const isExpanded = expandedCampaignId === campaign.id
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              setExpandedCampaignId(isExpanded ? null : campaign.id)
            }
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="sr-only">
              {isExpanded ? "Collapse" : "Expand"} recipients
            </span>
          </Button>
        )
      },
    },
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <div className="font-medium">{row.original.subject}</div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <Badge className={`${statusColors[status]} transition-colors duration-200`}>
            {status.toUpperCase()}
          </Badge>
        )
      },
    },
    {
      accessorKey: "recipients",
      header: "Recipients",
      cell: ({ row }) => {
        const sentCount = row.original.recipients.filter(
          (r) => r.status === "sent"
        ).length
        const totalCount = row.original.recipients.length
        return `${sentCount}/${totalCount}`
      },
    },
    {
      accessorKey: "scheduledAt",
      header: "Scheduled",
      cell: ({ row }) => {
        const scheduledAt = row.original.scheduledAt
        const scheduledTimezone = row.original.scheduledTimezone
        return scheduledAt
          ? formatInTimezone(scheduledAt, scheduledTimezone)
          : "-"
      },
    },
    {
      accessorKey: "sentAt",
      header: "Sent",
      cell: ({ row }) => {
        const sentAt = row.original.sentAt
        return sentAt ? format(new Date(sentAt), "PPp") : "-"
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const campaign = row.original
        const canSend =
          campaign.status === "draft" || campaign.status === "scheduled"

        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => duplicateMutation.mutate(campaign.id)}
              disabled={duplicateMutation.isPending}
            >
              Duplicate
            </Button>
            {canSend && (
              <Dialog
                open={sendDialogOpen === campaign.id}
                onOpenChange={(open) =>
                  setSendDialogOpen(open ? campaign.id : null)
                }
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Send
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send Campaign</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to send this campaign? This action
                      cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSendDialogOpen(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => sendMutation.mutate(campaign.id)}
                      disabled={sendMutation.isPending}
                    >
                      {sendMutation.isPending ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Dialog
              open={deleteDialogOpen === campaign.id}
              onOpenChange={(open) =>
                setDeleteDialogOpen(open ? campaign.id : null)
              }
            >
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Campaign</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this campaign? This action
                    cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteDialogOpen(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(campaign.id)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: campaigns,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
    enableRowSelection: true,
    getRowId: (row) => row.id,
  })

  const selectedIds = table.getFilteredSelectedRowModel().rows.map(
    (r) => r.original.id
  )
  const hasSelection = selectedIds.length > 0

  if (isLoading) {
    return <div className="text-center py-8">Loading campaigns...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
          </div>
          {isRefetching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Updating...</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {hasSelection && (
            <Dialog
              open={bulkDeleteDialogOpen}
              onOpenChange={setBulkDeleteDialogOpen}
            >
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete {selectedIds.length} selected
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete selected campaigns</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete {selectedIds.length} campaign
                    (s)? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setBulkDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => bulkDeleteMutation.mutate(selectedIds)}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    {bulkDeleteMutation.isPending
                      ? "Deleting..."
                      : `Delete ${selectedIds.length} campaign(s)`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            title="Refresh campaigns"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
          {hasScheduledCampaigns && (
            <Button
              variant="outline"
              onClick={() => processScheduledMutation.mutate()}
              disabled={processScheduledMutation.isPending}
            >
              {processScheduledMutation.isPending
                ? "Processing..."
                : "Process Scheduled"}
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-8 text-muted-foreground"
                >
                  No campaigns found. Create your first campaign to get started.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.flatMap((row) => {
                const campaign = row.original
                const isExpanded = expandedCampaignId === campaign.id
                return [
                  <TableRow
                    key={row.id}
                    className="transition-colors duration-200"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>,
                  ...(isExpanded
                    ? [
                        <TableRow key={`${row.id}-expanded`}>
                          <TableCell
                            colSpan={columns.length}
                            className="bg-muted/30 p-0 border-b"
                          >
                            <div className="p-4">
                              <h4 className="text-sm font-medium mb-3">
                                Recipients
                              </h4>
                              <CampaignRecipientsRow campaignId={campaign.id} />
                            </div>
                          </TableCell>
                        </TableRow>,
                      ]
                    : []),
                ]
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
