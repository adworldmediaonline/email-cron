"use client"

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useState } from "react"
import { format } from "date-fns"
import { formatInTimezone } from "@/lib/utils/timezone"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Send, Edit, Trash2, Calendar } from "lucide-react"
import type { EmailCampaign } from "@/lib/types/email"

interface EmailTableProps {
  data: EmailCampaign[]
  onEdit?: (campaign: EmailCampaign) => void
  onSend?: (campaignId: string) => void
  onDelete?: (campaignId: string) => void
  onSchedule?: (campaignId: string) => void
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  scheduled: "bg-blue-500",
  sending: "bg-yellow-500",
  sent: "bg-green-500",
  failed: "bg-red-500",
}

export function EmailTable({
  data,
  onEdit,
  onSend,
  onDelete,
  onSchedule,
}: EmailTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<EmailCampaign>[] = [
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <div className="font-medium">{row.original.subject}</div>
      ),
    },
    {
      accessorKey: "recipients",
      header: "Recipients",
      cell: ({ row }) => {
        const count = row.original.recipients?.length || 0
        return <div>{count} recipient{count !== 1 ? "s" : ""}</div>
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <Badge className={statusColors[status] || "bg-gray-500"}>
            {status}
          </Badge>
        )
      },
    },
    {
      accessorKey: "scheduledAt",
      header: "Scheduled At",
      cell: ({ row }) => {
        const scheduledAt = row.original.scheduledAt
        const scheduledTimezone = row.original.scheduledTimezone
        return scheduledAt
          ? formatInTimezone(scheduledAt, scheduledTimezone ?? null)
          : "-"
      },
    },
    {
      accessorKey: "sentAt",
      header: "Sent At",
      cell: ({ row }) => {
        const sentAt = row.original.sentAt
        return sentAt ? format(new Date(sentAt), "PPP p") : "-"
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const campaign = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(campaign)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onSend && campaign.status !== "sent" && (
                <DropdownMenuItem onClick={() => onSend(campaign.id)}>
                  <Send className="mr-2 h-4 w-4" />
                  Send Now
                </DropdownMenuItem>
              )}
              {onSchedule && campaign.status === "draft" && (
                <DropdownMenuItem onClick={() => onSchedule(campaign.id)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(campaign.id)}
                  variant="destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : typeof header.column.columnDef.header === "function"
                      ? header.column.columnDef.header({
                          column: header.column,
                          header: header,
                          table: table,
                        })
                      : header.column.columnDef.header}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {typeof cell.column.columnDef.cell === "function"
                      ? cell.column.columnDef.cell({
                          cell: cell,
                          column: cell.column,
                          row: row,
                          table: table,
                          getValue: cell.getValue,
                          renderValue: cell.renderValue,
                        })
                      : null}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No campaigns found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
