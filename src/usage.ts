/**
 * Pure usage tracking. No OpenCode imports live here so the accounting rules
 * can be unit tested without a server.
 */

export type TokenTotals = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export type TokenTotalsWithTotal = TokenTotals & { total: number }

export type RequestRecord = {
  sessionID: string
  messageID: string
  agent: string
  providerID: string
  modelID: string
  startedAt: number
  firstTokenAt?: number
  endedAt?: number
  durationMs?: number
  ttftMs?: number
  tokens: TokenTotals
  cost: number
  finish?: string
  errorType?: string
}

export type TurnRecord = {
  index: number
  sessionID: string
  startedAt: number
  endedAt?: number
  durationMs?: number
  outcome?: "succeeded" | "failed" | "interrupted"
  requests: number
  failedRequests: number
  /** Failures reported by the execution itself, with no failed model step. */
  executionErrors: number
  tokens: TokenTotals
  cost: number
  retries: number
  toolCalls: number
  toolFailures: number
}

export type ModelAggregate = {
  providerID: string
  modelID: string
  requests: number
  failedRequests: number
  errors: number
  tokens: TokenTotals
  cost: number
  latencyTotalMs: number
  ttftTotalMs: number
  latencySamples: number
  ttftSamples: number
}

export type SessionRecord = {
  sessionID: string
  startedAt: number
  lastActivityAt: number
  requests: number
  failedRequests: number
  tokens: TokenTotals
  cost: number
  errors: number
  /** Failures reported by the execution itself, with no failed model step. */
  executionErrors: number
  retries: number
  toolCalls: number
  toolFailures: number
  turns: TurnRecord[]
  currentTurn?: TurnRecord
  models: Map<string, ModelAggregate>
  serverTokens?: TokenTotals
  serverCost?: number
  /** Lifetime count of executions, kept apart from the capped turn list. */
  turnCount: number
  /** Lifetime count of failed requests per error type. */
  errorTypes: Map<string, number>
  /** Recent instants of every error, keyed by type, used by the per-minute windows. */
  errorTypeTimes: Map<string, number[]>
  /** Recent event instants used by the per-minute windows. */
  retryTimes: number[]
  toolTimes: number[]
  turnTimes: number[]
  executionErrorTimes: number[]
}

export type ErrorTypeSnapshot = {
  type: string
  count: number
  /** Percentage of the failed requests in scope. */
  percentage: number
  /** Percentage of every request in scope. */
  rate: number
  /** Failures of this type in the last 60 seconds. */
  perMinute: number
}

export type TurnSnapshot = {
  index: number
  startedAt: number
  endedAt?: number
  durationMs?: number
  outcome?: "succeeded" | "failed" | "interrupted"
  requests: number
  failedRequests: number
  /** Failures reported by the execution itself, with no failed model step. */
  executionErrors: number
  tokens: TokenTotalsWithTotal
  cost: number
  retries: number
  toolCalls: number
  toolFailures: number
  running: boolean
}

export type ModelSnapshot = {
  providerID: string
  modelID: string
  requests: number
  failedRequests: number
  errors: number
  tokens: TokenTotalsWithTotal
  cost: number
  avgLatencyMs: number
  avgTtftMs: number
}

export type SessionSnapshot = {
  sessionID: string
  startedAt: number
  lastActivityAt: number
  requests: number
  failedRequests: number
  tokens: TokenTotalsWithTotal
  cost: number
  usageSource: "server" | "tracked"
  errors: number
  /** Failures reported by the execution itself, with no failed model step. */
  executionErrors: number
  retries: number
  toolCalls: number
  toolFailures: number
  turns: number
  runningTurns: number
  avgLatencyMs: number
  avgTtftMs: number
  /** Requests per minute in the rolling 60 second window. */
  rpm: number
  /** Average requests per minute over the last 5 minutes. */
  rpm5m: number
  /** Failed requests as a percentage of every request. */
  errorRate: number
  /** Failed requests in the rolling 60 second window. */
  errorRpm: number
  /** Retries scheduled in the rolling 60 second window. */
  retryRpm: number
  /** Average retries per minute over the last 5 minutes. */
  retryRpm5m: number
  /** Tool calls in the rolling 60 second window. */
  toolRpm: number
  /** Average tool calls per minute over the last 5 minutes. */
  toolRpm5m: number
  /** Executions started in the rolling 60 second window. */
  turnRpm: number
  /** Average executions per minute over the last 5 minutes. */
  turnRpm5m: number
  errorTypes: ErrorTypeSnapshot[]
}

export type UsageSnapshot = {
  generatedAt: number
  scope: "all" | "session"
  sessionID?: string
  trackedSince: number
  sessions: number
  requests: number
  failedRequests: number
  rpm: number
  rpm5m: number
  avgRpm: number
  tokens: TokenTotalsWithTotal
  cost: number
  usageSource: "server" | "tracked"
  errors: number
  /** Failures reported by the execution itself, with no failed model step. */
  executionErrors: number
  retries: number
  toolCalls: number
  toolFailures: number
  avgLatencyMs: number
  avgTtftMs: number
  /** Executions started since the tracking started. */
  turnCount: number
  turns: TurnSnapshot[]
  models: ModelSnapshot[]
  sessionList: SessionSnapshot[]
  /** Failed requests as a percentage of every request. */
  errorRate: number
  /** Failed requests in the rolling 60 second window. */
  errorRpm: number
  /** Average failed requests per minute over the last 5 minutes. */
  errorRpm5m: number
  /** Retries scheduled in the rolling 60 second window. */
  retryRpm: number
  /** Average retries per minute over the last 5 minutes. */
  retryRpm5m: number
  /** Tool calls in the rolling 60 second window. */
  toolRpm: number
  /** Average tool calls per minute over the last 5 minutes. */
  toolRpm5m: number
  /** Executions started in the rolling 60 second window. */
  turnRpm: number
  /** Average executions per minute over the last 5 minutes. */
  turnRpm5m: number
  errorTypes: ErrorTypeSnapshot[]
  tracked: {
    requests: number
    failedRequests: number
    tokens: TokenTotalsWithTotal
    cost: number
  }
}

export type SnapshotScope = { kind: "all" } | { kind: "session"; sessionID: string }

export type TrackerLimits = {
  /** How many turns to keep in memory per session. Older turns are dropped. */
  maxTurnsPerSession: number
  /** How many recent requests to keep in memory. */
  maxRequests: number
  /** IANA time zone used to bucket the daily counters. Defaults to the system zone. */
  timeZone?: string
}

/** One calendar day of usage, in the tracker's time zone. */
export type DayBucket = {
  date: string
  requests: number
  failedRequests: number
  errors: number
  executionErrors: number
  retries: number
  toolCalls: number
  toolFailures: number
  turns: number
  tokens: TokenTotals
  cost: number
}

export const MINUTE = 60_000

export function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
}

export function sumTokens(left: TokenTotals, right: TokenTotals): TokenTotals {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    reasoning: left.reasoning + right.reasoning,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
  }
}

export function withTotal(tokens: TokenTotals): TokenTotalsWithTotal {
  return { ...tokens, total: tokens.input + tokens.output }
}

export function tokensFromUsage(usage: {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}): TokenTotals {
  return {
    input: usage.input,
    output: usage.output,
    reasoning: usage.reasoning,
    cacheRead: usage.cache.read,
    cacheWrite: usage.cache.write,
  }
}

const requestKey = (sessionID: string, messageID: string) => `${sessionID}:${messageID}`

/** How many calendar days of usage the tracker keeps for the daily summary. */
const MAX_DAYS = 7

/** `YYYY-MM-DD` of a date in the given IANA zone, or the system zone when omitted. */
function dayFormatter(timeZone?: string): Intl.DateTimeFormat {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    } catch {
      // An unknown zone falls through to the system default.
    }
  }
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function emptyDay(date: string): DayBucket {
  return {
    date,
    requests: 0,
    failedRequests: 0,
    errors: 0,
    executionErrors: 0,
    retries: 0,
    toolCalls: 0,
    toolFailures: 0,
    turns: 0,
    tokens: emptyTokens(),
    cost: 0,
  }
}

/**
 * Tracks model usage from public OpenCode events.
 *
 * A request is one model step (`session.step.*`). A turn is one execution
 * (`session.execution.*`) and may contain many requests. Session totals come
 * from the server's own `session.usage.updated` projection when available and
 * fall back to the locally tracked sum otherwise.
 */
export class UsageTracker {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly requests = new Map<string, RequestRecord>()
  private readonly trackedSince: number
  private readonly limits: TrackerLimits
  /** Usage per calendar day, newest last, kept for `maxDays` days. */
  private readonly days = new Map<string, DayBucket>()
  private readonly dayFormatter: Intl.DateTimeFormat
  private turnCounter = 0

  constructor(startedAt = Date.now(), limits: TrackerLimits = { maxTurnsPerSession: 50, maxRequests: 1_000 }) {
    this.trackedSince = startedAt
    this.limits = limits
    this.dayFormatter = dayFormatter(limits.timeZone)
  }

  /** The calendar day of a timestamp, in the tracker's time zone (`YYYY-MM-DD`). */
  dayKeyOf(at: number): string {
    return this.dayFormatter.format(new Date(at))
  }

  /** The daily bucket of a timestamp, creating today's when missing. */
  day(at: number): DayBucket {
    const date = this.dayKeyOf(at)
    let bucket = this.days.get(date)
    if (!bucket) {
      bucket = emptyDay(date)
      this.days.set(date, bucket)
      this.trimDays()
    }
    return bucket
  }

  /** A copy of one day's counters; today's by default. */
  daySummary(dateKey?: string): DayBucket {
    const date = dateKey ?? this.dayKeyOf(Date.now())
    const bucket = this.days.get(date)
    return bucket ? { ...bucket, tokens: { ...bucket.tokens } } : emptyDay(date)
  }

  /** The days kept in memory, oldest first. */
  dayKeys(): string[] {
    return [...this.days.keys()].sort()
  }

  /** The tracker's day formatter time zone, when one was configured. */
  get timeZone(): string | undefined {
    return this.limits.timeZone
  }

  private trimDays(): void {
    const excess = this.days.size - MAX_DAYS
    if (excess <= 0) return
    for (const date of [...this.days.keys()].sort().slice(0, excess)) this.days.delete(date)
  }

  startRequest(input: {
    sessionID: string
    messageID: string
    agent: string
    providerID: string
    modelID: string
    startedAt: number
  }): void {
    const session = this.session(input.sessionID, input.startedAt)
    const key = requestKey(input.sessionID, input.messageID)
    if (this.requests.has(key)) return
    const request: RequestRecord = {
      sessionID: input.sessionID,
      messageID: input.messageID,
      agent: input.agent,
      providerID: input.providerID,
      modelID: input.modelID,
      startedAt: input.startedAt,
      tokens: emptyTokens(),
      cost: 0,
    }
    this.requests.set(key, request)
    session.requests += 1
    session.lastActivityAt = input.startedAt
    this.day(input.startedAt).requests += 1
    const turn = session.currentTurn ?? this.startTurn(input.sessionID, input.startedAt)
    turn.requests += 1
    const model = this.sessionModel(session, input.providerID, input.modelID)
    model.requests += 1
    this.trimRequests()
  }

  markFirstToken(input: { sessionID: string; messageID: string; at: number }): void {
    const request = this.requests.get(requestKey(input.sessionID, input.messageID))
    if (!request || request.firstTokenAt !== undefined) return
    request.firstTokenAt = input.at
    request.ttftMs = Math.max(0, input.at - request.startedAt)
  }

  endRequest(input: {
    sessionID: string
    messageID: string
    endedAt: number
    tokens: TokenTotals
    cost: number
    finish?: string
  }): void {
    this.complete(input, undefined)
  }

  failRequest(input: {
    sessionID: string
    messageID: string
    endedAt: number
    tokens?: TokenTotals
    cost?: number
    finish?: string
    errorType: string
  }): void {
    this.complete(input, input.errorType)
  }

  private complete(
    input: {
      sessionID: string
      messageID: string
      endedAt: number
      tokens?: TokenTotals
      cost?: number
      finish?: string
    },
    errorType?: string,
  ): void {
    const key = requestKey(input.sessionID, input.messageID)
    const request = this.requests.get(key)
    if (!request) return
    if (request.endedAt !== undefined) return
    request.endedAt = input.endedAt
    request.durationMs = Math.max(0, input.endedAt - request.startedAt)
    request.tokens = input.tokens ?? request.tokens
    request.cost = input.cost ?? request.cost
    request.finish = input.finish
    request.errorType = errorType

    const session = this.session(input.sessionID, input.endedAt)
    session.tokens = sumTokens(session.tokens, request.tokens)
    session.cost += request.cost
    session.lastActivityAt = input.endedAt
    const day = this.day(input.endedAt)
    day.tokens = sumTokens(day.tokens, request.tokens)
    day.cost += request.cost
    if (errorType !== undefined) {
      session.failedRequests += 1
      session.errors += 1
      day.failedRequests += 1
      day.errors += 1
      session.errorTypes.set(errorType, (session.errorTypes.get(errorType) ?? 0) + 1)
      this.noteErrorTime(session, errorType, input.endedAt)
      const turn = session.currentTurn
      if (turn) turn.failedRequests += 1
    }
    const turn = session.currentTurn
    if (turn) {
      turn.tokens = sumTokens(turn.tokens, request.tokens)
      turn.cost += request.cost
    }
    const model = this.sessionModel(session, request.providerID, request.modelID)
    model.tokens = sumTokens(model.tokens, request.tokens)
    model.cost += request.cost
    model.latencyTotalMs += request.durationMs ?? 0
    model.latencySamples += 1
    if (request.ttftMs !== undefined) {
      model.ttftTotalMs += request.ttftMs
      model.ttftSamples += 1
    }
    if (errorType !== undefined) {
      model.failedRequests += 1
      model.errors += 1
    }
  }

  startTurn(sessionID: string, at: number): TurnRecord {
    const session = this.session(sessionID, at)
    const index = ++this.turnCounter
    const turn: TurnRecord = {
      index,
      sessionID,
      startedAt: at,
      requests: 0,
      failedRequests: 0,
      executionErrors: 0,
      tokens: emptyTokens(),
      cost: 0,
      retries: 0,
      toolCalls: 0,
      toolFailures: 0,
    }
    session.turns.push(turn)
    session.currentTurn = turn
    session.turnCount += 1
    this.day(at).turns += 1
    session.turnTimes.push(at)
    session.lastActivityAt = at
    this.trimTurns(session)
    this.pruneEvents(session, at)
    return turn
  }

  endTurn(sessionID: string, at: number, outcome: "succeeded" | "failed" | "interrupted"): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    const turn = session.currentTurn
    if (!turn) return
    turn.endedAt = at
    turn.durationMs = Math.max(0, at - turn.startedAt)
    turn.outcome = outcome
    session.currentTurn = undefined
    session.lastActivityAt = at
  }

  /**
   * Counts a failure reported by the execution itself.
   *
   * Some failures happen before any model step runs, for example an unknown
   * model. When the execution already had a failed step, that step carries the
   * error and this failure is not counted twice.
   */
  noteExecutionError(sessionID: string, errorType: string, at: number): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    const turn = session.currentTurn
    if (turn && turn.failedRequests > 0) return
    session.errors += 1
    session.executionErrors += 1
    const day = this.day(at)
    day.errors += 1
    day.executionErrors += 1
    session.errorTypes.set(errorType, (session.errorTypes.get(errorType) ?? 0) + 1)
    session.executionErrorTimes.push(at)
    this.noteErrorTime(session, errorType, at)
    session.lastActivityAt = at
    this.pruneEvents(session, at)
    if (turn) turn.executionErrors += 1
  }

  /** Keeps the instant of an error for the per-minute windows. */
  private noteErrorTime(session: SessionRecord, errorType: string, at: number): void {
    const times = session.errorTypeTimes.get(errorType) ?? []
    times.push(at)
    session.errorTypeTimes.set(errorType, times)
  }

  noteRetry(sessionID: string, at: number): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    session.retries += 1
    this.day(at).retries += 1
    session.retryTimes.push(at)
    session.lastActivityAt = at
    this.pruneEvents(session, at)
    if (session.currentTurn) session.currentTurn.retries += 1
  }

  noteToolCall(sessionID: string, at: number, failed = false): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    session.toolCalls += 1
    const day = this.day(at)
    day.toolCalls += 1
    if (failed) {
      session.toolFailures += 1
      day.toolFailures += 1
    }
    session.toolTimes.push(at)
    session.lastActivityAt = at
    this.pruneEvents(session, at)
    if (session.currentTurn) {
      session.currentTurn.toolCalls += 1
      if (failed) session.currentTurn.toolFailures += 1
    }
  }

  /** Stores the server's authoritative cumulative usage for a session. */
  syncSessionUsage(sessionID: string, tokens: TokenTotals, cost: number, at: number): void {
    const session = this.session(sessionID, at)
    session.serverTokens = { ...tokens }
    session.serverCost = cost
    session.lastActivityAt = at
  }

  removeSession(sessionID: string): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    this.sessions.delete(sessionID)
    for (const [key, request] of this.requests) {
      if (request.sessionID === sessionID) this.requests.delete(key)
    }
  }

  get sessionIDs(): string[] {
    return [...this.sessions.keys()]
  }

  snapshot(now: number, scope: SnapshotScope): UsageSnapshot {
    if (scope.kind === "session") return this.sessionSnapshot(now, scope.sessionID)
    return this.allSnapshot(now)
  }

  private sessionSnapshot(now: number, sessionID: string): UsageSnapshot {
    const session = this.sessions.get(sessionID)
    const trackedTokens = withTotal(session?.tokens ?? emptyTokens())
    const trackedCost = session?.cost ?? 0
    const serverTokens = session?.serverTokens
    const useServer = serverTokens !== undefined
    const tokens = useServer ? withTotal(serverTokens) : trackedTokens
    const cost = useServer ? (session?.serverCost ?? 0) : trackedCost
    const requests = session?.requests ?? 0
    const scoped = this.requestsFor(sessionID)
    const latency = this.latencyOf(scoped)
    const failedRequests = session?.failedRequests ?? 0
    const retries = session?.retries ?? 0
    const toolCalls = session?.toolCalls ?? 0
    const retryTimes = session?.retryTimes ?? []
    const toolTimes = session?.toolTimes ?? []
    const turnTimes = session?.turnTimes ?? []
    const failedScoped = scoped.filter((request) => request.errorType !== undefined)
    const errorTypeTimes = session?.errorTypeTimes ?? new Map<string, number[]>()
    const failedTimes = flattenTimes(errorTypeTimes)

    return {
      generatedAt: now,
      scope: "session",
      sessionID,
      trackedSince: session?.startedAt ?? now,
      sessions: session ? 1 : 0,
      requests,
      failedRequests: session?.failedRequests ?? 0,
      rpm: this.rate(scoped, now, MINUTE),
      rpm5m: this.perMinute(scoped, now, MINUTE * 5),
      avgRpm: this.averageRate(scoped.length, now - (session?.startedAt ?? now)),
      tokens,
      cost,
      usageSource: useServer ? "server" : "tracked",
      errors: session?.errors ?? 0,
      executionErrors: session?.executionErrors ?? 0,
      retries,
      toolCalls,
      toolFailures: session?.toolFailures ?? 0,
      avgLatencyMs: latency.avgLatencyMs,
      avgTtftMs: latency.avgTtftMs,
      turnCount: session?.turnCount ?? 0,
      turns: (session?.turns ?? []).map((turn) => turnSnapshot(turn, now)),
      models: this.modelSnapshots(sessionID),
      sessionList: session ? [this.sessionSnapshotOf(session, now)] : [],
      errorRate: percentage(session?.errors ?? 0, requests),
      errorRpm: countSince(failedTimes, now, MINUTE),
      errorRpm5m: this.perMinuteEvents(failedTimes, now, MINUTE * 5),
      retryRpm: countSince(retryTimes, now, MINUTE),
      retryRpm5m: this.perMinuteEvents(retryTimes, now, MINUTE * 5),
      toolRpm: countSince(toolTimes, now, MINUTE),
      toolRpm5m: this.perMinuteEvents(toolTimes, now, MINUTE * 5),
      turnRpm: countSince(turnTimes, now, MINUTE),
      turnRpm5m: this.perMinuteEvents(turnTimes, now, MINUTE * 5),
      errorTypes: errorTypeSnapshots(session?.errorTypes ?? new Map(), errorTypeTimes, session?.errors ?? 0, requests, now),
      tracked: {
        requests,
        failedRequests,
        tokens: trackedTokens,
        cost: trackedCost,
      },
    }
  }

  private allSnapshot(now: number): UsageSnapshot {
    let requests = 0
    let failedRequests = 0
    let errors = 0
    let executionErrors = 0
    let retries = 0
    let toolCalls = 0
    let toolFailures = 0
    const tokens = emptyTokens()
    const trackedTokens = emptyTokens()
    let cost = 0
    let trackedCost = 0
    let allFromServer = true
    const turns: TurnSnapshot[] = []
    const sessionList: SessionSnapshot[] = []
    const errorTypes = new Map<string, number>()
    const errorTypeTimes = new Map<string, number[]>()
    const retryTimes: number[] = []
    const toolTimes: number[] = []
    const turnTimes: number[] = []
    const executionErrorTimes: number[] = []
    let turnCount = 0

    for (const session of this.sessions.values()) {
      requests += session.requests
      failedRequests += session.failedRequests
      errors += session.errors
      executionErrors += session.executionErrors
      retries += session.retries
      toolCalls += session.toolCalls
      toolFailures += session.toolFailures
      turnCount += session.turnCount
      for (const [type, count] of session.errorTypes) {
        errorTypes.set(type, (errorTypes.get(type) ?? 0) + count)
      }
      for (const [type, times] of session.errorTypeTimes) {
        errorTypeTimes.set(type, [...(errorTypeTimes.get(type) ?? []), ...times])
      }
      retryTimes.push(...session.retryTimes)
      toolTimes.push(...session.toolTimes)
      turnTimes.push(...session.turnTimes)
      executionErrorTimes.push(...session.executionErrorTimes)

      const effective = session.serverTokens ?? session.tokens
      const effectiveCost = session.serverTokens === undefined ? session.cost : (session.serverCost ?? 0)
      if (session.serverTokens === undefined) allFromServer = false
      Object.assign(tokens, sumTokens(tokens, effective))
      cost += effectiveCost
      Object.assign(trackedTokens, sumTokens(trackedTokens, session.tokens))
      trackedCost += session.cost

      for (const turn of session.turns) turns.push(turnSnapshot(turn, now))
      sessionList.push(this.sessionSnapshotOf(session, now))
    }

    const latency = this.latencyOf([...this.requests.values()])
    const allRequests = [...this.requests.values()]
    const failedScoped = allRequests.filter((request) => request.errorType !== undefined)
    const failedTimes = flattenTimes(errorTypeTimes)

    return {
      generatedAt: now,
      scope: "all",
      trackedSince: this.trackedSince,
      sessions: this.sessions.size,
      requests,
      failedRequests,
      rpm: this.rate(allRequests, now, MINUTE),
      rpm5m: this.perMinute(allRequests, now, MINUTE * 5),
      avgRpm: this.averageRate(requests, now - this.trackedSince),
      tokens: withTotal(tokens),
      cost,
      usageSource: allFromServer ? "server" : "tracked",
      errors,
      executionErrors,
      retries,
      toolCalls,
      toolFailures,
      avgLatencyMs: latency.avgLatencyMs,
      avgTtftMs: latency.avgTtftMs,
      turnCount,
      turns: turns.sort((left, right) => right.startedAt - left.startedAt),
      models: this.mergedModels(),
      sessionList: sessionList.sort((left, right) => right.lastActivityAt - left.lastActivityAt),
      errorRate: percentage(errors, requests),
      errorRpm: countSince(failedTimes, now, MINUTE),
      errorRpm5m: this.perMinuteEvents(failedTimes, now, MINUTE * 5),
      retryRpm: countSince(retryTimes, now, MINUTE),
      retryRpm5m: this.perMinuteEvents(retryTimes, now, MINUTE * 5),
      toolRpm: countSince(toolTimes, now, MINUTE),
      toolRpm5m: this.perMinuteEvents(toolTimes, now, MINUTE * 5),
      turnRpm: countSince(turnTimes, now, MINUTE),
      turnRpm5m: this.perMinuteEvents(turnTimes, now, MINUTE * 5),
      errorTypes: errorTypeSnapshots(errorTypes, errorTypeTimes, errors, requests, now),
      tracked: {
        requests,
        failedRequests,
        tokens: withTotal(trackedTokens),
        cost: trackedCost,
      },
    }
  }

  private sessionSnapshotOf(session: SessionRecord, now: number): SessionSnapshot {
    const scoped = this.requestsFor(session.sessionID)
    const latency = this.latencyOf(scoped)
    const useServer = session.serverTokens !== undefined
    const failedScoped = scoped.filter((request) => request.errorType !== undefined)
    const failedTimes = flattenTimes(session.errorTypeTimes)
    return {
      sessionID: session.sessionID,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      requests: session.requests,
      failedRequests: session.failedRequests,
      tokens: withTotal(useServer ? session.serverTokens! : session.tokens),
      cost: useServer ? (session.serverCost ?? 0) : session.cost,
      usageSource: useServer ? "server" : "tracked",
      errors: session.errors,
      executionErrors: session.executionErrors,
      retries: session.retries,
      toolCalls: session.toolCalls,
      toolFailures: session.toolFailures,
      turns: session.turnCount,
      runningTurns: session.currentTurn ? 1 : 0,
      avgLatencyMs: latency.avgLatencyMs,
      avgTtftMs: latency.avgTtftMs,
      rpm: this.rate(scoped, now, MINUTE),
      rpm5m: this.perMinute(scoped, now, MINUTE * 5),
      errorRate: percentage(session.errors, session.requests),
      errorRpm: countSince(failedTimes, now, MINUTE),
      retryRpm: countSince(session.retryTimes, now, MINUTE),
      retryRpm5m: this.perMinuteEvents(session.retryTimes, now, MINUTE * 5),
      toolRpm: countSince(session.toolTimes, now, MINUTE),
      toolRpm5m: this.perMinuteEvents(session.toolTimes, now, MINUTE * 5),
      turnRpm: countSince(session.turnTimes, now, MINUTE),
      turnRpm5m: this.perMinuteEvents(session.turnTimes, now, MINUTE * 5),
      errorTypes: errorTypeSnapshots(session.errorTypes, session.errorTypeTimes, session.errors, session.requests, now),
    }
  }

  private requestsFor(sessionID: string): RequestRecord[] {
    return [...this.requests.values()].filter((request) => request.sessionID === sessionID)
  }

  private latencyOf(requests: RequestRecord[]): { avgLatencyMs: number; avgTtftMs: number } {
    let latencyTotalMs = 0
    let latencySamples = 0
    let ttftTotalMs = 0
    let ttftSamples = 0
    for (const request of requests) {
      if (request.durationMs !== undefined) {
        latencyTotalMs += request.durationMs
        latencySamples += 1
      }
      if (request.ttftMs !== undefined) {
        ttftTotalMs += request.ttftMs
        ttftSamples += 1
      }
    }
    return {
      avgLatencyMs: latencySamples === 0 ? 0 : Math.round(latencyTotalMs / latencySamples),
      avgTtftMs: ttftSamples === 0 ? 0 : Math.round(ttftTotalMs / ttftSamples),
    }
  }

  private modelSnapshots(sessionID: string): ModelSnapshot[] {
    const session = this.sessions.get(sessionID)
    if (!session) return []
    return [...session.models.values()].map((aggregate) => modelSnapshot(aggregate))
  }

  /** Merges the per-session model aggregates into a global view. */
  private mergedModels(): ModelSnapshot[] {
    const merged = new Map<string, ModelAggregate>()
    for (const session of this.sessions.values()) {
      for (const [key, aggregate] of session.models) {
        const target = merged.get(key) ?? {
          providerID: aggregate.providerID,
          modelID: aggregate.modelID,
          requests: 0,
          failedRequests: 0,
          errors: 0,
          tokens: emptyTokens(),
          cost: 0,
          latencyTotalMs: 0,
          ttftTotalMs: 0,
          latencySamples: 0,
          ttftSamples: 0,
        }
        target.requests += aggregate.requests
        target.failedRequests += aggregate.failedRequests
        target.errors += aggregate.errors
        target.tokens = sumTokens(target.tokens, aggregate.tokens)
        target.cost += aggregate.cost
        target.latencyTotalMs += aggregate.latencyTotalMs
        target.latencySamples += aggregate.latencySamples
        target.ttftTotalMs += aggregate.ttftTotalMs
        target.ttftSamples += aggregate.ttftSamples
        merged.set(key, target)
      }
    }
    return [...merged.values()].map((aggregate) => modelSnapshot(aggregate))
  }

  private session(sessionID: string, at: number): SessionRecord {
    const existing = this.sessions.get(sessionID)
    if (existing) return existing
    const created: SessionRecord = {
      sessionID,
      startedAt: at,
      lastActivityAt: at,
      requests: 0,
      failedRequests: 0,
      tokens: emptyTokens(),
      cost: 0,
      errors: 0,
      executionErrors: 0,
      retries: 0,
      toolCalls: 0,
      toolFailures: 0,
      turns: [],
      models: new Map(),
      turnCount: 0,
      errorTypes: new Map(),
      errorTypeTimes: new Map(),
      retryTimes: [],
      toolTimes: [],
      turnTimes: [],
      executionErrorTimes: [],
    }
    this.sessions.set(sessionID, created)
    return created
  }

  private sessionModel(session: SessionRecord, providerID: string, modelID: string): ModelAggregate {
    const key = `${providerID}/${modelID}`
    const existing = session.models.get(key)
    if (existing) return existing
    const created: ModelAggregate = {
      providerID,
      modelID,
      requests: 0,
      failedRequests: 0,
      errors: 0,
      tokens: emptyTokens(),
      cost: 0,
      latencyTotalMs: 0,
      ttftTotalMs: 0,
      latencySamples: 0,
      ttftSamples: 0,
    }
    session.models.set(key, created)
    return created
  }


  /** Drops the oldest request records once the retention limit is exceeded. */
  private trimRequests(): void {
    const excess = this.requests.size - this.limits.maxRequests
    if (excess <= 0) return
    let removed = 0
    for (const key of this.requests.keys()) {
      if (removed >= excess) break
      this.requests.delete(key)
      removed += 1
    }
  }

  /** Drops the oldest turns of a session once the retention limit is exceeded. */
  private trimTurns(session: SessionRecord): void {
    const excess = session.turns.length - this.limits.maxTurnsPerSession
    if (excess <= 0) return
    session.turns.splice(0, excess)
  }

  /** Drops instants older than the widest window the plugin reports. */
  private pruneEvents(session: SessionRecord, at: number): void {
    const threshold = at - MINUTE * 5
    session.retryTimes = session.retryTimes.filter((time) => time > threshold)
    session.toolTimes = session.toolTimes.filter((time) => time > threshold)
    session.turnTimes = session.turnTimes.filter((time) => time > threshold)
    session.executionErrorTimes = session.executionErrorTimes.filter((time) => time > threshold)
    for (const [type, times] of session.errorTypeTimes) {
      const kept = times.filter((time) => time > threshold)
      if (kept.length === 0) session.errorTypeTimes.delete(type)
      else session.errorTypeTimes.set(type, kept)
    }
  }

  private rate(requests: RequestRecord[], now: number, windowMs: number): number {
    const threshold = now - windowMs
    let count = 0
    for (const request of requests) if (request.startedAt > threshold) count += 1
    return count
  }

  /** Average events per minute over a window. */
  private perMinuteAverage(count: number, now: number, windowMs: number): number {
    const minutes = windowMs / MINUTE
    return Math.round((count / minutes) * 100) / 100
  }

  /** Average requests per minute over a window, counting only the window. */
  private perMinute(requests: RequestRecord[], now: number, windowMs: number): number {
    return this.perMinuteAverage(this.rate(requests, now, windowMs), now, windowMs)
  }

  /** Average events per minute over a window, counting only the window. */
  private perMinuteEvents(times: number[], now: number, windowMs: number): number {
    return this.perMinuteAverage(countSince(times, now, windowMs), now, windowMs)
  }

  private averageRate(count: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return count === 0 ? 0 : count
    return Math.round((count / elapsedMs) * MINUTE * 100) / 100
  }
}

/** Counts the instants inside the rolling window. */
function countSince(times: number[], now: number, windowMs: number): number {
  const threshold = now - windowMs
  let count = 0
  for (const time of times) if (time > threshold) count += 1
  return count
}

/** Flattens the instants of every error type into a single list. */
function flattenTimes(times: Map<string, number[]>): number[] {
  const result: number[] = []
  for (const values of times.values()) result.push(...values)
  return result
}

/** Percentage of a part in a whole, rounded to one decimal. */
export function percentage(part: number, whole: number): number {
  if (whole === 0) return part === 0 ? 0 : 100
  return Math.round((part / whole) * 1000) / 10
}

/**
 * Breaks failures down by type with the share of the failures and the share
 * of every request, plus the failures of each type in the last minute.
 */
export function errorTypeSnapshots(
  counts: Map<string, number>,
  times: Map<string, number[]>,
  failedRequests: number,
  totalRequests: number,
  now: number,
): ErrorTypeSnapshot[] {
  const threshold = now - MINUTE
  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      percentage: percentage(count, failedRequests),
      rate: percentage(count, totalRequests),
      perMinute: countSince(times.get(type) ?? [], now, MINUTE),
    }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
}

function turnSnapshot(turn: TurnRecord, now: number): TurnSnapshot {
  const running = turn.endedAt === undefined
  return {
    index: turn.index,
    startedAt: turn.startedAt,
    endedAt: turn.endedAt,
    durationMs: running ? Math.max(0, now - turn.startedAt) : turn.durationMs,
    outcome: turn.outcome,
    requests: turn.requests,
    failedRequests: turn.failedRequests,
    executionErrors: turn.executionErrors,
    tokens: withTotal(turn.tokens),
    cost: turn.cost,
    retries: turn.retries,
    toolCalls: turn.toolCalls,
    toolFailures: turn.toolFailures,
    running,
  }
}

function modelSnapshot(model: ModelAggregate): ModelSnapshot {
  return {
    providerID: model.providerID,
    modelID: model.modelID,
    requests: model.requests,
    failedRequests: model.failedRequests,
    errors: model.errors,
    tokens: withTotal(model.tokens),
    cost: model.cost,
    avgLatencyMs: model.latencySamples === 0 ? 0 : Math.round(model.latencyTotalMs / model.latencySamples),
    avgTtftMs: model.ttftSamples === 0 ? 0 : Math.round(model.ttftTotalMs / model.ttftSamples),
  }
}

/** Drops optional keys that are absent so the RPC payload always matches its schema. */
export function serializeSnapshot(snapshot: UsageSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt,
    scope: snapshot.scope,
    ...(snapshot.sessionID === undefined ? {} : { sessionID: snapshot.sessionID }),
    trackedSince: snapshot.trackedSince,
    sessions: snapshot.sessions,
    requests: snapshot.requests,
    failedRequests: snapshot.failedRequests,
    rpm: snapshot.rpm,
    rpm5m: snapshot.rpm5m,
    avgRpm: snapshot.avgRpm,
    tokens: snapshot.tokens,
    cost: snapshot.cost,
    usageSource: snapshot.usageSource,
    errors: snapshot.errors,
    executionErrors: snapshot.executionErrors,
    retries: snapshot.retries,
    toolCalls: snapshot.toolCalls,
    toolFailures: snapshot.toolFailures,
    avgLatencyMs: snapshot.avgLatencyMs,
    avgTtftMs: snapshot.avgTtftMs,
    turnCount: snapshot.turnCount,
    turns: snapshot.turns.map((turn) => ({
      index: turn.index,
      startedAt: turn.startedAt,
      ...(turn.endedAt === undefined ? {} : { endedAt: turn.endedAt }),
      ...(turn.durationMs === undefined ? {} : { durationMs: turn.durationMs }),
      ...(turn.outcome === undefined ? {} : { outcome: turn.outcome }),
      requests: turn.requests,
      failedRequests: turn.failedRequests,
      executionErrors: turn.executionErrors,
      tokens: turn.tokens,
      cost: turn.cost,
      retries: turn.retries,
      toolCalls: turn.toolCalls,
      toolFailures: turn.toolFailures,
      running: turn.running,
    })),
    models: snapshot.models.map((model) => ({
      providerID: model.providerID,
      modelID: model.modelID,
      requests: model.requests,
      failedRequests: model.failedRequests,
      errors: model.errors,
      tokens: model.tokens,
      cost: model.cost,
      avgLatencyMs: model.avgLatencyMs,
      avgTtftMs: model.avgTtftMs,
    })),
    errorRate: snapshot.errorRate,
    errorRpm: snapshot.errorRpm,
    errorRpm5m: snapshot.errorRpm5m,
    retryRpm: snapshot.retryRpm,
    retryRpm5m: snapshot.retryRpm5m,
    toolRpm: snapshot.toolRpm,
    toolRpm5m: snapshot.toolRpm5m,
    turnRpm: snapshot.turnRpm,
    turnRpm5m: snapshot.turnRpm5m,
    errorTypes: snapshot.errorTypes.map((error) => ({
      type: error.type,
      count: error.count,
      percentage: error.percentage,
      rate: error.rate,
      perMinute: error.perMinute,
    })),
    sessionList: snapshot.sessionList.map((session) => ({
      sessionID: session.sessionID,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      requests: session.requests,
      failedRequests: session.failedRequests,
      tokens: session.tokens,
      cost: session.cost,
      usageSource: session.usageSource,
      errors: session.errors,
      executionErrors: session.executionErrors,
      retries: session.retries,
      toolCalls: session.toolCalls,
      toolFailures: session.toolFailures,
      turns: session.turns,
      runningTurns: session.runningTurns,
      avgLatencyMs: session.avgLatencyMs,
      avgTtftMs: session.avgTtftMs,
      rpm: session.rpm,
      rpm5m: session.rpm5m,
      errorRate: session.errorRate,
      errorRpm: session.errorRpm,
      retryRpm: session.retryRpm,
      retryRpm5m: session.retryRpm5m,
      toolRpm: session.toolRpm,
      toolRpm5m: session.toolRpm5m,
      turnRpm: session.turnRpm,
      turnRpm5m: session.turnRpm5m,
      errorTypes: session.errorTypes.map((error) => ({
        type: error.type,
        count: error.count,
        percentage: error.percentage,
        rate: error.rate,
        perMinute: error.perMinute,
      })),
    })),
    tracked: snapshot.tracked,
  }
}
