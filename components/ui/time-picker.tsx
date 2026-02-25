"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0")
)
const PERIODS = ["AM", "PM"] as const

function parseTime(value: string): {
  hour: number
  minute: number
  period: "AM" | "PM"
} {
  if (!value || !value.includes(":")) {
    const now = new Date()
    const h = now.getHours()
    const isPm = h >= 12
    return {
      hour: h === 0 ? 12 : h > 12 ? h - 12 : h,
      minute: now.getMinutes(),
      period: isPm ? "PM" : "AM",
    }
  }
  const [hStr, mStr] = value.split(":")
  const h24 = parseInt(hStr ?? "0", 10)
  const minute = parseInt(mStr ?? "0", 10)
  const isPm = h24 >= 12
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return {
    hour: hour12,
    minute,
    period: isPm ? "PM" : "AM",
  }
}

function toHHmm(hour: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour
  if (period === "PM" && hour !== 12) h24 = hour + 12
  if (period === "AM" && hour === 12) h24 = 0
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TimePicker({
  value,
  onChange,
  onOpenChange,
  placeholder = "Select time",
  disabled,
  className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const parsed = parseTime(value)
  const [hour, setHour] = React.useState(parsed.hour)
  const [minute, setMinute] = React.useState(parsed.minute)
  const [period, setPeriod] = React.useState<"AM" | "PM">(parsed.period)

  React.useEffect(() => {
    const p = parseTime(value)
    setHour(p.hour)
    setMinute(p.minute)
    setPeriod(p.period)
  }, [value])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
    if (!next) {
      onChange(toHHmm(hour, minute, period))
    }
  }

  const displayValue = value
    ? (() => {
        const p = parseTime(value)
        const h = p.hour
        const m = String(p.minute).padStart(2, "0")
        return `${h}:${m} ${p.period}`
      })()
    : placeholder

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span>{displayValue}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex border-b px-2 py-2">
          <ScrollColumn
            options={HOURS_12.map(String)}
            value={String(hour)}
            onChange={(v) => setHour(parseInt(v, 10))}
            ariaLabel="Hour"
          />
          <ScrollColumn
            options={MINUTES}
            value={String(minute).padStart(2, "0")}
            onChange={(v) => setMinute(parseInt(v, 10))}
            ariaLabel="Minute"
          />
          <ScrollColumn
            options={[...PERIODS]}
            value={period}
            onChange={(v) => setPeriod(v as "AM" | "PM")}
            ariaLabel="AM/PM"
          />
        </div>
        <div className="flex justify-end gap-2 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ScrollColumn({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const itemRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    itemRef.current?.scrollIntoView({ block: "nearest" })
  }, [value])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={ariaLabel}
      className="flex h-[180px] w-14 flex-col overflow-y-auto rounded-md border bg-muted/30 scrollbar-thin"
    >
      {options.map((opt) => (
        <button
          key={opt}
          ref={(el) => {
            if (opt === value) itemRef.current = el
          }}
          type="button"
          role="option"
          aria-selected={opt === value}
          className={cn(
            "flex h-9 shrink-0 items-center justify-center rounded px-2 text-sm transition-colors",
            opt === value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
