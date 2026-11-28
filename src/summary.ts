/**
 * The daily usage summary: option parsing and message rendering.
 *
 * The summary travels through the phone notifications plugin (`send` method of
 * the `mobile-notifications` RPC), so the text must fit a lock screen: the
 * title and body are clipped to the same caps the notification side enforces.
 */
import { formatCost, formatCount } from "./format.js"
import type { DayBucket } from "./usage.js"

export type DailyOptions = {
  enabled: boolean
  /** Local time in the summary's zone, `HH:MM`. */
  at: string
  /** IANA time zone; omitted means the server's system zone. */
  timeZone?: string
  title: string
  body: string
}

export const DEFAULT_DAILY: Required<Pick<DailyOptions, "at" | "title" | "body">> & { enabled: boolean } = {
  enabled: true,
  at: "20:00",
  title: "Uso do modelo · {date}",
  body: "{requests} req ({turns} turnos) · in {input} · out {output} · {errors} erros · {retries} retries · {tools} tools · {cost}",
}

export const TITLE_CAP = 80
export const BODY_CAP = 300

/** Parses `HH:MM` into minutes since midnight, or `undefined`. */
export function parseTimeOfDay(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined
  const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(value.trim())
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return hours * 60 + minutes
}

export function resolveDailyOptions(raw: unknown): DailyOptions {
  const value = (raw ?? {}) as Record<string, unknown>
  const timeZone = typeof value.timeZone === "string" && validZone(value.timeZone) ? value.timeZone : undefined
  return {
    enabled: value.enabled !== false,
    at: typeof value.at === "string" && parseTimeOfDay(value.at) !== undefined ? value.at.trim() : DEFAULT_DAILY.at,
    timeZone,
    title: typeof value.title === "string" && value.title.trim() ? value.title : DEFAULT_DAILY.title,
    body: typeof value.body === "string" && value.body.trim() ? value.body : DEFAULT_DAILY.body,
  }
}

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export type DailyValues = {
  date: string
  time: string
  requests: number
  failed: number
  errors: number
  retries: number
  tools: number
  turns: number
  input: string
  output: string
  reasoning: string
  cacheRead: string
  cacheWrite: string
  total: string
  cost: string
}

/** Expands `{name}` placeholders; unknown names stay untouched. */
export function renderDaily(template: string, values: DailyValues): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = (values as unknown as Record<string, unknown>)[name]
    return typeof value === "string" || typeof value === "number" ? String(value) : match
  })
}

/** Formats a day bucket into the placeholder values, in the bucket's zone. */
export function dailyValues(bucket: DayBucket, zone?: string, now = Date.now()): DailyValues {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const stamp = formatter.formatToParts(new Date(now))
  const part = (type: string) => stamp.find((piece) => piece.type === type)?.value ?? ""
  return {
    date: `${part("day")}/${part("month")}/${part("year")}`,
    time: `${part("hour")}:${part("minute")}`,
    requests: bucket.requests,
    failed: bucket.failedRequests,
    errors: bucket.errors,
    retries: bucket.retries,
    tools: bucket.toolCalls,
    turns: bucket.turns,
    input: formatCount(bucket.tokens.input),
    output: formatCount(bucket.tokens.output),
    reasoning: formatCount(bucket.tokens.reasoning),
    cacheRead: formatCount(bucket.tokens.cacheRead),
    cacheWrite: formatCount(bucket.tokens.cacheWrite),
    total: formatCount(bucket.tokens.input + bucket.tokens.output),
    cost: formatCost(bucket.cost),
  }
}

/** Composes the message for the phone, clipped to the lock-screen caps. */
export function composeDaily(
  options: DailyOptions,
  bucket: DayBucket,
  now = Date.now(),
): { title: string; body: string } {
  const values = dailyValues(bucket, options.timeZone, now)
  return {
    title: renderDaily(options.title, values).slice(0, TITLE_CAP),
    body: renderDaily(options.body, values).slice(0, BODY_CAP),
  }
}

/** Minutes since midnight in a zone, for the scheduler. */
export function minutesOfDay(at: number, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(at))
  const hours = Number(parts.find((piece) => piece.type === "hour")?.value ?? "0")
  const minutes = Number(parts.find((piece) => piece.type === "minute")?.value ?? "0")
  return (hours % 24) * 60 + minutes
}
