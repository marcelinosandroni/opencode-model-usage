export type Options = {
  enabled?: boolean
  /** Milliseconds between periodic usage summaries in the server log. 0 disables the log. */
  logInterval?: number
  /** Only track these providers. Empty means every provider. */
  providerIDs?: string[]
  /** Only track these models. Empty means every model. */
  modelIDs?: string[]
  /** Count tool calls and tool failures. */
  trackTools?: boolean
  /** How many turns to keep per session. */
  maxTurnsPerSession?: number
  /** How many recent requests to keep in memory for latency metrics. */
  maxRequests?: number
}

export type ResolvedOptions = {
  readonly enabled: boolean
  readonly logInterval: number
  readonly providerIDs: ReadonlySet<string>
  readonly modelIDs: ReadonlySet<string>
  readonly trackTools: boolean
  readonly maxTurnsPerSession: number
  readonly maxRequests: number
}

export const DEFAULT_LOG_INTERVAL = 60_000
export const DEFAULT_MAX_TURNS = 50
export const DEFAULT_MAX_REQUESTS = 1_000

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []

const positiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback
  return Math.floor(value)
}

export function resolveOptions(value: unknown): ResolvedOptions {
  const options = record(value)
  const providerIDs = strings(options.providerIDs)
  const modelIDs = strings(options.modelIDs)
  return {
    enabled: options.enabled !== false,
    logInterval: positiveInt(options.logInterval, DEFAULT_LOG_INTERVAL),
    providerIDs: new Set(providerIDs.map((item) => item.toLowerCase())),
    modelIDs: new Set(modelIDs),
    trackTools: options.trackTools !== false,
    maxTurnsPerSession: positiveInt(options.maxTurnsPerSession, DEFAULT_MAX_TURNS) || DEFAULT_MAX_TURNS,
    maxRequests: positiveInt(options.maxRequests, DEFAULT_MAX_REQUESTS) || DEFAULT_MAX_REQUESTS,
  }
}

export function modelAllowed(providerID: string, modelID: string, options: ResolvedOptions): boolean {
  if (options.providerIDs.size > 0 && !options.providerIDs.has(providerID.toLowerCase())) return false
  if (options.modelIDs.size > 0 && !options.modelIDs.has(modelID)) return false
  return true
}
