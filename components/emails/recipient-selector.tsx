"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Recipient {
  recipientEmail: string
  recipientName?: string | null
}

interface RecipientSelectorProps {
  value: Recipient[]
  onChange: (recipients: Recipient[]) => void
  disabled?: boolean
}

export function RecipientSelector({
  value,
  onChange,
  disabled,
}: RecipientSelectorProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single")
  const [singleEmail, setSingleEmail] = useState("")
  const [singleName, setSingleName] = useState("")
  const [bulkEmails, setBulkEmails] = useState("")

  const handleAddSingle = () => {
    if (!singleEmail.trim()) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(singleEmail)) {
      alert("Please enter a valid email address")
      return
    }

    const newRecipient: Recipient = {
      recipientEmail: singleEmail.trim(),
      recipientName: singleName.trim() || null,
    }

    onChange([...value, newRecipient])
    setSingleEmail("")
    setSingleName("")
  }

  const handleAddBulk = () => {
    if (!bulkEmails.trim()) return

    const lines = bulkEmails.split("\n").filter((line) => line.trim())
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const newRecipients: Recipient[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (emailRegex.test(trimmed)) {
        newRecipients.push({
          recipientEmail: trimmed,
          recipientName: null,
        })
      }
    }

    if (newRecipients.length === 0) {
      alert("No valid email addresses found")
      return
    }

    onChange([...value, ...newRecipients])
    setBulkEmails("")
  }

  const handleRemove = (index: number) => {
    const newRecipients = value.filter((_, i) => i !== index)
    onChange(newRecipients)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Recipients ({value.length})</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
          <SelectTrigger disabled={disabled}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single Recipient</SelectItem>
            <SelectItem value="bulk">Bulk Recipients</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "single" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Input
                type="email"
                placeholder="email@example.com"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddSingle()
                  }
                }}
              />
              <Input
                type="text"
                placeholder="Name (optional)"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddSingle()
                  }
                }}
              />
            </div>
            <Button
              type="button"
              onClick={handleAddSingle}
              disabled={disabled || !singleEmail.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            placeholder="Enter email addresses, one per line:&#10;email1@example.com&#10;email2@example.com"
            value={bulkEmails}
            onChange={(e) => setBulkEmails(e.target.value)}
            disabled={disabled}
            rows={6}
          />
          <Button
            type="button"
            onClick={handleAddBulk}
            disabled={disabled || !bulkEmails.trim()}
          >
            Add Recipients
          </Button>
        </div>
      )}

      {value.length > 0 && (
        <div className="space-y-2">
          <Label>Added Recipients</Label>
          <div className="border-input rounded-lg border p-2 space-y-1 max-h-48 overflow-y-auto">
            {value.map((recipient, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded bg-muted/50 p-2"
              >
                <div>
                  <div className="text-sm font-medium">{recipient.recipientEmail}</div>
                  {recipient.recipientName && (
                    <div className="text-xs text-muted-foreground">
                      {recipient.recipientName}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
