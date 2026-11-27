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
  retries: number
  toolCalls: number
  toolFailures: number
  turns: TurnRecord[]
  currentTurn?: TurnRecord
  serverTokens?: TokenTotals
  serverCost?: number
  requestTimes: number[]
}

export type TurnSnapshot = {
  index: number
  startedAt: number
  endedAt?: number
  durationMs?: number
  outcome?: "succeeded" | "failed" | "interrupted"
  requests: number
  failedRequests: number
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
  retries: number
  toolCalls: number
  toolFailures: number
  avgLatencyMs: number
  avgTtftMs: number
  turns: TurnSnapshot[]
  models: ModelSnapshot[]
  tracked: {
    requests: number
    failedRequests: number
    tokens: TokenTotalsWithTotal
    cost: number
  }
}

export type SnapshotScope = { kind: "all" } | { kind: "session"; sessionID: string }

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
  private readonly models = new Map<string, ModelAggregate>()
  private readonly requestTimes: number[] = []
  private readonly trackedSince: number
  private turnCounter = 0

  constructor(startedAt = Date.now()) {
    this.trackedSince = startedAt
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
    this.requestTimes.push(input.startedAt)
    session.requestTimes.push(input.startedAt)
    session.requests += 1
    session.lastActivityAt = input.startedAt
    const turn = session.currentTurn ?? this.startTurn(input.sessionID, input.startedAt)
    turn.requests += 1
    const model = this.model(input.providerID, input.modelID)
    model.requests += 1
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
    if (errorType !== undefined) {
      session.failedRequests += 1
      session.errors += 1
      const turn = session.currentTurn
      if (turn) {
        turn.failedRequests += 1
      }
    }
    const turn = session.currentTurn
    if (turn) {
      turn.tokens = sumTokens(turn.tokens, request.tokens)
      turn.cost += request.cost
    }
    const model = this.model(request.providerID, request.modelID)
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
      tokens: emptyTokens(),
      cost: 0,
      retries: 0,
      toolCalls: 0,
      toolFailures: 0,
    }
    session.turns.push(turn)
    session.currentTurn = turn
    session.lastActivityAt = at
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

  noteRetry(sessionID: string, at: number): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    session.retries += 1
    session.lastActivityAt = at
    if (session.currentTurn) session.currentTurn.retries += 1
  }

  noteToolCall(sessionID: string, at: number, failed = false): void {
    const session = this.sessions.get(sessionID)
    if (!session) return
    session.toolCalls += 1
    session.lastActivityAt = at
    if (failed) session.toolFailures += 1
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
    const scopedTimes = session?.requestTimes ?? []

    return {
      generatedAt: now,
      scope: "session",
      sessionID,
      trackedSince: session?.startedAt ?? now,
      sessions: session ? 1 : 0,
      requests,
      failedRequests: session?.failedRequests ?? 0,
      rpm: this.rate(scopedTimes, now, MINUTE),
      rpm5m: this.rate(scopedTimes, now, MINUTE * 5),
      avgRpm: this.averageRate(scopedTimes.length, now - (session?.startedAt ?? now)),
      tokens,
      cost,
      usageSource: useServer ? "server" : "tracked",
      errors: session?.errors ?? 0,
      retries: session?.retries ?? 0,
      toolCalls: session?.toolCalls ?? 0,
      toolFailures: session?.toolFailures ?? 0,
      avgLatencyMs: this.sessionLatency(sessionID).avgLatencyMs,
      avgTtftMs: this.sessionLatency(sessionID).avgTtftMs,
      turns: (session?.turns ?? []).map((turn) => turnSnapshot(turn)),
      models: this.modelSnapshots(sessionID),
      tracked: {
        requests,
        failedRequests: session?.failedRequests ?? 0,
        tokens: trackedTokens,
        cost: trackedCost,
      },
    }
  }

  private allSnapshot(now: number): UsageSnapshot {
    let requests = 0
    let failedRequests = 0
    let errors = 0
    let retries = 0
    let toolCalls = 0
    let toolFailures = 0
    const tokens = emptyTokens()
    let cost = 0
    let latencyTotalMs = 0
    let latencySamples = 0
    let ttftTotalMs = 0
    let ttftSamples = 0
    const turns: TurnSnapshot[] = []

    for (const session of this.sessions.values()) {
      requests += session.requests
      failedRequests += session.failedRequests
      errors += session.errors
      retries += session.retries
      toolCalls += session.toolCalls
      toolFailures += session.toolFailures
      cost += session.cost
      Object.assign(tokens, sumTokens(tokens, session.tokens))
      for (const turn of session.turns) turns.push(turnSnapshot(turn))
    }

    for (const request of this.requests.values()) {
      if (request.durationMs === undefined) continue
      latencyTotalMs += request.durationMs
      latencySamples += 1
      if (request.ttftMs !== undefined) {
        ttftTotalMs += request.ttftMs
        ttftSamples += 1
      }
    }

    return {
      generatedAt: now,
      scope: "all",
      trackedSince: this.trackedSince,
      sessions: this.sessions.size,
      requests,
      failedRequests,
      rpm: this.rate(this.requestTimes, now, MINUTE),
      rpm5m: this.rate(this.requestTimes, now, MINUTE * 5),
      avgRpm: this.averageRate(requests, now - this.trackedSince),
      tokens: withTotal(tokens),
      cost,
      usageSource: "tracked",
      errors,
      retries,
      toolCalls,
      toolFailures,
      avgLatencyMs: latencySamples === 0 ? 0 : Math.round(latencyTotalMs / latencySamples),
      avgTtftMs: ttftSamples === 0 ? 0 : Math.round(ttftTotalMs / ttftSamples),
      turns: turns.sort((left, right) => right.startedAt - left.startedAt),
      models: [...this.models.values()].map((model) => modelSnapshot(model)),
      tracked: {
        requests,
        failedRequests,
        tokens: withTotal(tokens),
        cost,
      },
    }
  }

  private sessionLatency(sessionID: string): { avgLatencyMs: number; avgTtftMs: number } {
    let latencyTotalMs = 0
    let latencySamples = 0
    let ttftTotalMs = 0
    let ttftSamples = 0
    for (const request of this.requests.values()) {
      if (request.sessionID !== sessionID) continue
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

  private modelSnapshots(sessionID: string): ModelSnapshot[] {    const aggregates = new Map<string, ModelAggregate>()
    for (const request of this.requests.values()) {
      if (request.sessionID !== sessionID) continue
      const key = `${request.providerID}/${request.modelID}`
      const aggregate = aggregates.get(key) ?? {
        providerID: request.providerID,
        modelID: request.modelID,
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
      aggregate.requests += 1
      aggregate.tokens = sumTokens(aggregate.tokens, request.tokens)
      aggregate.cost += request.cost
      if (request.durationMs !== undefined) {
        aggregate.latencyTotalMs += request.durationMs
        aggregate.latencySamples += 1
      }
      if (request.ttftMs !== undefined) {
        aggregate.ttftTotalMs += request.ttftMs
        aggregate.ttftSamples += 1
      }
      if (request.errorType !== undefined) {
        aggregate.failedRequests += 1
        aggregate.errors += 1
      }
      aggregates.set(key, aggregate)
    }
    return [...aggregates.values()].map((aggregate) => modelSnapshot(aggregate))
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
      retries: 0,
      toolCalls: 0,
      toolFailures: 0,
      turns: [],
      requestTimes: [],
    }
    this.sessions.set(sessionID, created)
    return created
  }

  private model(providerID: string, modelID: string): ModelAggregate {
    const key = `${providerID}/${modelID}`
    const existing = this.models.get(key)
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
    this.models.set(key, created)
    return created
  }

  private rate(times: number[], now: number, windowMs: number): number {
    const threshold = now - windowMs
    let count = 0
    for (const at of times) if (at > threshold) count += 1
    return count
  }

  private averageRate(count: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return count === 0 ? 0 : count
    return Math.round((count / elapsedMs) * MINUTE * 100) / 100
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
    retries: snapshot.retries,
    toolCalls: snapshot.toolCalls,
    toolFailures: snapshot.toolFailures,
    avgLatencyMs: snapshot.avgLatencyMs,
    avgTtftMs: snapshot.avgTtftMs,
    turns: snapshot.turns.map((turn) => ({
      index: turn.index,
      startedAt: turn.startedAt,
      ...(turn.endedAt === undefined ? {} : { endedAt: turn.endedAt }),
      ...(turn.durationMs === undefined ? {} : { durationMs: turn.durationMs }),
      ...(turn.outcome === undefined ? {} : { outcome: turn.outcome }),
      requests: turn.requests,
      failedRequests: turn.failedRequests,
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
    tracked: snapshot.tracked,
  }
}

function turnSnapshot(turn: TurnRecord): TurnSnapshot {  return {
    index: turn.index,
    startedAt: turn.startedAt,
    endedAt: turn.endedAt,
    durationMs: turn.durationMs,
    outcome: turn.outcome,
    requests: turn.requests,
    failedRequests: turn.failedRequests,
    tokens: withTotal(turn.tokens),
    cost: turn.cost,
    retries: turn.retries,
    toolCalls: turn.toolCalls,
    toolFailures: turn.toolFailures,
    running: turn.endedAt === undefined,
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
