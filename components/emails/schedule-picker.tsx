"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SchedulePickerProps {
  value: Date | null
  onChange: (date: Date | null) => void
  disabled?: boolean
}

export function SchedulePicker({ value, onChange, disabled }: SchedulePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value) : undefined
  )
  const [time, setTime] = useState<string>(
    value ? format(value, "HH:mm") : ""
  )

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined)
      setTime("")
      onChange(null)
      return
    }

    setSelectedDate(date)

    // Combine date with time (use existing time or default to current time)
    if (time) {
      const [hours, minutes] = time.split(":").map(Number)
      const combinedDate = new Date(date)
      combinedDate.setHours(hours, minutes, 0, 0)
      onChange(combinedDate)
    } else {
      // If no time set yet, set default to current time
      const now = new Date()
      const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      setTime(defaultTime)
      const combinedDate = new Date(date)
      combinedDate.setHours(now.getHours(), now.getMinutes(), 0, 0)
      onChange(combinedDate)
    }
  }

  const handleTimeChange = (newTime: string) => {
    setTime(newTime)

    if (selectedDate && newTime) {
      const [hours, minutes] = newTime.split(":").map(Number)
      const combinedDate = new Date(selectedDate)
      combinedDate.setHours(hours, minutes, 0, 0)
      onChange(combinedDate)
    } else if (selectedDate && !newTime) {
      // If time is cleared but date exists, keep the date but reset time
      onChange(null)
    }
  }

  const handleClear = () => {
    setSelectedDate(undefined)
    setTime("")
    onChange(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Schedule Email (Date & Time)</Label>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="schedule-date" className="text-xs text-muted-foreground">
              Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="schedule-date"
                  variant="outline"
                  disabled={disabled}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="schedule-time" className="text-xs text-muted-foreground">
              Time
            </Label>
            <Input
              id="schedule-time"
              type="time"
              value={time}
              onChange={(e) => handleTimeChange(e.target.value)}
              disabled={disabled}
              className="w-full"
              placeholder="HH:MM"
            />
          </div>
        </div>
        {value && (
          <div className="text-sm text-muted-foreground">
            Scheduled for: {format(value, "PPP 'at' p")}
          </div>
        )}
      </div>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled}
        >
          Clear schedule
        </Button>
      )}
    </div>
  )
}
