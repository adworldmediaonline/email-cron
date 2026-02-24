import { DateTime } from "luxon"

function resolveTimezone(timezone: string): string {
  return timezone === "local" ? getBrowserTimezone() : timezone
}

export function toUtcFromZoned(date: Date, timezone: string): Date {
  const zone = resolveTimezone(timezone)
  const dt = DateTime.fromObject(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    },
    { zone }
  )
  return dt.toUTC().toJSDate()
}

export function toZonedFromUtc(utcDate: Date, timezone: string): Date {
  const zone = resolveTimezone(timezone)
  const dt = DateTime.fromJSDate(utcDate, { zone: "utc" })
  return dt.setZone(zone).toJSDate()
}

export function getZonedDateParts(
  utcDate: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const zone = resolveTimezone(timezone)
  const dt = DateTime.fromJSDate(utcDate, { zone: "utc" }).setZone(zone)
  return {
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    return DateTime.now().setZone(timezone).isValid
  } catch {
    return false
  }
}

export interface TimezoneOption {
  value: string
  label: string
}

export function getCommonTimezones(): Array<{ group: string; zones: TimezoneOption[] }> {
  const formatLabel = (zone: string) => {
    try {
      const dt = DateTime.now().setZone(zone)
      const offset = dt.toFormat("ZZ")
      const name = zone.split("/").pop()?.replace(/_/g, " ") ?? zone
      return `${name} (${offset})`
    } catch {
      return zone
    }
  }

  return [
    {
      group: "Local",
      zones: [
        {
          value: "local",
          label: "Browser / Local time",
        },
      ],
    },
    {
      group: "Americas",
      zones: [
        { value: "America/New_York", label: formatLabel("America/New_York") },
        { value: "America/Chicago", label: formatLabel("America/Chicago") },
        { value: "America/Denver", label: formatLabel("America/Denver") },
        { value: "America/Los_Angeles", label: formatLabel("America/Los_Angeles") },
        { value: "America/Toronto", label: formatLabel("America/Toronto") },
        { value: "America/Sao_Paulo", label: formatLabel("America/Sao_Paulo") },
      ],
    },
    {
      group: "Europe",
      zones: [
        { value: "Europe/London", label: formatLabel("Europe/London") },
        { value: "Europe/Paris", label: formatLabel("Europe/Paris") },
        { value: "Europe/Berlin", label: formatLabel("Europe/Berlin") },
        { value: "Europe/Amsterdam", label: formatLabel("Europe/Amsterdam") },
      ],
    },
    {
      group: "Asia Pacific",
      zones: [
        { value: "Asia/Tokyo", label: formatLabel("Asia/Tokyo") },
        { value: "Asia/Shanghai", label: formatLabel("Asia/Shanghai") },
        { value: "Asia/Singapore", label: formatLabel("Asia/Singapore") },
        { value: "Asia/Kolkata", label: formatLabel("Asia/Kolkata") },
        { value: "Australia/Sydney", label: formatLabel("Australia/Sydney") },
        { value: "Australia/Melbourne", label: formatLabel("Australia/Melbourne") },
      ],
    },
  ]
}

export function getBrowserTimezone(): string {
  if (typeof Intl === "undefined") return "UTC"
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

export function resolveTimezoneForApi(timezone: string | null | undefined): string | null {
  if (!timezone) return null
  return timezone === "local" ? getBrowserTimezone() : timezone
}

export function formatInTimezone(
  utcDate: Date | string | null,
  timezone: string | null,
  formatStr = "fff"
): string {
  if (!utcDate) return "—"
  const zone = timezone && timezone !== "local" ? timezone : getBrowserTimezone()
  const dt = DateTime.fromISO(
    typeof utcDate === "string" ? utcDate : utcDate.toISOString(),
    { zone: "utc" }
  ).setZone(zone)
  return dt.toFormat(formatStr)
}
