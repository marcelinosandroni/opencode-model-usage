import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MINUTE, UsageTracker, emptyTokens, serializeSnapshot, sumTokens, tokensFromUsage, withTotal } from "../src/usage.ts"

const tokens = (input: number, output: number, reasoning = 0, cacheRead = 0, cacheWrite = 0) => ({
  input,
  output,
  reasoning,
  cacheRead,
  cacheWrite,
})

describe("token helpers", () => {
  it("adds token buckets", () => {
    assert.deepEqual(sumTokens(tokens(1, 2, 3, 4, 5), tokens(10, 20, 30, 40, 50)), {
      input: 11,
      output: 22,
      reasoning: 33,
      cacheRead: 44,
      cacheWrite: 55,
    })
  })

  it("treats total as input plus output", () => {
    assert.equal(withTotal(tokens(10, 5, 100, 200, 300)).total, 15)
  })

  it("maps the server usage shape", () => {
    assert.deepEqual(tokensFromUsage({ input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } }), {
      input: 1,
      output: 2,
      reasoning: 3,
      cacheRead: 4,
      cacheWrite: 5,
    })
  })

  it("starts empty", () => {
    assert.deepEqual(emptyTokens(), { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 })
  })
})

describe("usage tracker", () => {
  it("counts requests, tokens and cost per request", () => {
    const tracker = new UsageTracker(0)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    })
    tracker.markFirstToken({ sessionID: "ses_a", messageID: "msg_1", at: 1_400 })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 2_000,
      tokens: tokens(100, 20, 5, 50, 1),
      cost: 0.25,
      finish: "stop",
    })

    const snapshot = tracker.snapshot(2_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.requests, 1)
    assert.equal(snapshot.failedRequests, 0)
    assert.equal(snapshot.tokens.input, 100)
    assert.equal(snapshot.tokens.output, 20)
    assert.equal(snapshot.tokens.reasoning, 5)
    assert.equal(snapshot.tokens.cacheRead, 50)
    assert.equal(snapshot.tokens.cacheWrite, 1)
    assert.equal(snapshot.tokens.total, 120)
    assert.equal(snapshot.cost, 0.25)
    assert.equal(snapshot.avgLatencyMs, 1_000)
    assert.equal(snapshot.avgTtftMs, 400)
    assert.equal(snapshot.models.length, 1)
    assert.equal(snapshot.models[0].providerID, "nvidia")
    assert.equal(snapshot.models[0].requests, 1)
  })

  it("ignores a repeated start for the same message", () => {
    const tracker = new UsageTracker(0)
    const request = {
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    }
    tracker.startRequest(request)
    tracker.startRequest(request)
    assert.equal(tracker.snapshot(1_000, { kind: "session", sessionID: "ses_a" }).requests, 1)
  })

  it("records failed requests with their error type", () => {
    const tracker = new UsageTracker(0)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    })
    tracker.failRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 1_500,
      errorType: "provider.rate-limit",
    })

    const snapshot = tracker.snapshot(1_500, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.failedRequests, 1)
    assert.equal(snapshot.errors, 1)
    assert.equal(snapshot.avgLatencyMs, 500)
  })

  it("does not double count a finished request", () => {
    const tracker = new UsageTracker(0)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 2_000,
      tokens: tokens(10, 10),
      cost: 1,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 2_500,
      tokens: tokens(10, 10),
      cost: 1,
    })

    const snapshot = tracker.snapshot(2_500, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.tokens.input, 10)
    assert.equal(snapshot.cost, 1)
  })

  it("groups requests into turns", () => {
    const tracker = new UsageTracker(0)
    tracker.startTurn("ses_a", 1_000)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_100,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 2_000,
      tokens: tokens(10, 5),
      cost: 0.5,
    })
    tracker.endTurn("ses_a", 2_100, "succeeded")

    tracker.startTurn("ses_a", 3_000)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_2",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 3_100,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_2",
      endedAt: 4_000,
      tokens: tokens(20, 7),
      cost: 0.75,
    })

    const snapshot = tracker.snapshot(4_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.turns.length, 2)
    assert.equal(snapshot.turns[0].requests, 1)
    assert.equal(snapshot.turns[0].outcome, "succeeded")
    assert.equal(snapshot.turns[0].durationMs, 1_100)
    assert.equal(snapshot.turns[0].tokens.total, 15)
    assert.equal(snapshot.turns[0].cost, 0.5)
    assert.equal(snapshot.turns[1].running, true)
    assert.equal(snapshot.turns[1].requests, 1)
    assert.equal(snapshot.tokens.total, 42)
    assert.equal(snapshot.cost, 1.25)
  })

  it("counts retries and tool calls inside the current turn", () => {
    const tracker = new UsageTracker(0)
    tracker.startTurn("ses_a", 1_000)
    tracker.noteRetry("ses_a", 1_500)
    tracker.noteToolCall("ses_a", 1_600, false)
    tracker.noteToolCall("ses_a", 1_700, true)

    const snapshot = tracker.snapshot(1_700, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.retries, 1)
    assert.equal(snapshot.toolCalls, 2)
    assert.equal(snapshot.toolFailures, 1)
    assert.equal(snapshot.turns[0].retries, 1)
    assert.equal(snapshot.turns[0].toolCalls, 2)
  })

  it("prefers the server usage for the session totals", () => {
    const tracker = new UsageTracker(0)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 2_000,
      tokens: tokens(10, 5),
      cost: 0.1,
    })
    tracker.syncSessionUsage("ses_a", tokens(500, 50), 2.5, 2_100)

    const snapshot = tracker.snapshot(2_100, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.usageSource, "server")
    assert.equal(snapshot.tokens.input, 500)
    assert.equal(snapshot.cost, 2.5)
    assert.equal(snapshot.tracked.tokens.input, 10)
    assert.equal(snapshot.tracked.cost, 0.1)
    assert.equal(snapshot.requests, 1)
  })

  it("computes requests per minute over the rolling window", () => {
    const tracker = new UsageTracker(0)
    const now = 10 * MINUTE
    for (let index = 0; index < 3; index++) {
      tracker.startRequest({
        sessionID: "ses_a",
        messageID: `msg_${index}`,
        agent: "build",
        providerID: "nvidia",
        modelID: "nvidia/test",
        startedAt: now - 10_000,
      })
    }
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_old",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: now - 3 * MINUTE,
    })

    const snapshot = tracker.snapshot(now, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.rpm, 3)
    // Average per minute over the last 5 minutes: 4 requests in 5 minutes.
    assert.equal(snapshot.rpm5m, 0.8)
    assert.equal(snapshot.requests, 4)
  })

  it("aggregates every session in the all scope", () => {
    const tracker = new UsageTracker(0)
    for (const sessionID of ["ses_a", "ses_b"]) {
      tracker.startRequest({
        sessionID,
        messageID: "msg_1",
        agent: "build",
        providerID: "nvidia",
        modelID: "nvidia/test",
        startedAt: 1_000,
      })
      tracker.endRequest({
        sessionID,
        messageID: "msg_1",
        endedAt: 2_000,
        tokens: tokens(10, 5),
        cost: 0.5,
      })
    }

    const snapshot = tracker.snapshot(2_000, { kind: "all" })
    assert.equal(snapshot.scope, "all")
    assert.equal(snapshot.sessions, 2)
    assert.equal(snapshot.requests, 2)
    assert.equal(snapshot.tokens.total, 30)
    assert.equal(snapshot.cost, 1)
    assert.equal(snapshot.usageSource, "tracked")
  })

  it("drops a deleted session", () => {
    const tracker = new UsageTracker(0)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    })
    tracker.removeSession("ses_a")
    const snapshot = tracker.snapshot(2_000, { kind: "all" })
    assert.equal(snapshot.sessions, 0)
    assert.equal(snapshot.requests, 0)
  })

  it("serializes without absent optional keys", () => {
    const tracker = new UsageTracker(0)
    tracker.startTurn("ses_a", 1_000)
    const serialized = serializeSnapshot(tracker.snapshot(1_000, { kind: "all" })) as Record<string, unknown>
    assert.equal("sessionID" in serialized, false)
    const turns = serialized.turns as Array<Record<string, unknown>>
    assert.equal("endedAt" in turns[0], false)
    assert.equal("outcome" in turns[0], false)
    assert.equal(turns[0].running, true)
  })

  it("reports the elapsed time of a running turn", () => {
    const tracker = new UsageTracker(0)
    tracker.startTurn("ses_a", 1_000)
    const snapshot = tracker.snapshot(6_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.turns[0].running, true)
    assert.equal(snapshot.turns[0].durationMs, 5_000)
  })

  it("breaks the sessions down in the all scope", () => {
    const tracker = new UsageTracker(0)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_000,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      endedAt: 2_000,
      tokens: tokens(10, 5),
      cost: 0.5,
    })
    tracker.startRequest({
      sessionID: "ses_b",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 3_000,
    })

    const snapshot = tracker.snapshot(4_000, { kind: "all" })
    assert.equal(snapshot.sessionList.length, 2)
    assert.equal(snapshot.sessionList[0].sessionID, "ses_b")
    assert.equal(snapshot.sessionList[0].runningTurns, 1)
    assert.equal(snapshot.sessionList[1].sessionID, "ses_a")
    assert.equal(snapshot.sessionList[1].requests, 1)
    assert.equal(snapshot.sessionList[1].usageSource, "tracked")
  })

  it("prefers the server totals of every session in the all scope", () => {
    const tracker = new UsageTracker(0)
    tracker.syncSessionUsage("ses_a", tokens(500, 50), 2.5, 1_000)
    tracker.syncSessionUsage("ses_b", tokens(100, 10), 1, 1_000)

    const snapshot = tracker.snapshot(2_000, { kind: "all" })
    assert.equal(snapshot.usageSource, "server")
    assert.equal(snapshot.tokens.input, 600)
    assert.equal(snapshot.cost, 3.5)
    assert.equal(snapshot.tracked.tokens.input, 0)
  })

  it("keeps only the most recent turns per session", () => {
    const tracker = new UsageTracker(0, { maxTurnsPerSession: 2, maxRequests: 100 })
    for (let index = 0; index < 4; index++) {
      tracker.startTurn("ses_a", 1_000 + index)
      tracker.endTurn("ses_a", 1_500 + index, "succeeded")
    }

    const snapshot = tracker.snapshot(10_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.turns.length, 2)
    assert.equal(snapshot.turns[0].index, 3)
    assert.equal(snapshot.turns[1].index, 4)
  })

  it("keeps only the most recent requests", () => {
    const tracker = new UsageTracker(0, { maxTurnsPerSession: 50, maxRequests: 2 })
    for (let index = 0; index < 4; index++) {
      tracker.startRequest({
        sessionID: "ses_a",
        messageID: `msg_${index}`,
        agent: "build",
        providerID: "nvidia",
        modelID: "nvidia/test",
        startedAt: 1_000 + index,
      })
    }

    const snapshot = tracker.snapshot(10_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.requests, 4)
    assert.equal(snapshot.models[0].requests, 4)
    // Only the two retained requests still count towards the rolling window.
    assert.equal(snapshot.rpm, 2)

    const later = tracker.snapshot(10 * MINUTE, { kind: "session", sessionID: "ses_a" })
    assert.equal(later.rpm, 0)
    assert.equal(later.rpm5m, 0)
  })

  it("breaks the errors down by type with their share", () => {
    const tracker = new UsageTracker(0)
    const fail = (messageID: string, errorType: string, at: number) => {
      tracker.startRequest({
        sessionID: "ses_a",
        messageID,
        agent: "build",
        providerID: "nvidia",
        modelID: "nvidia/test",
        startedAt: at,
      })
      tracker.failRequest({ sessionID: "ses_a", messageID, endedAt: at + 100, errorType })
    }
    fail("msg_1", "provider.rate-limit", 1_000)
    fail("msg_2", "provider.rate-limit", 1_100)
    fail("msg_3", "provider.internal", 1_200)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_4",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 1_300,
    })
    tracker.endRequest({
      sessionID: "ses_a",
      messageID: "msg_4",
      endedAt: 1_400,
      tokens: tokens(10, 5),
      cost: 0.1,
    })

    const snapshot = tracker.snapshot(2_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.errors, 3)
    assert.equal(snapshot.failedRequests, 3)
    assert.equal(snapshot.errorRate, 75)
    assert.equal(snapshot.errorRpm, 3)
    assert.equal(snapshot.errorTypes.length, 2)
    assert.equal(snapshot.errorTypes[0].type, "provider.rate-limit")
    assert.equal(snapshot.errorTypes[0].count, 2)
    assert.equal(snapshot.errorTypes[0].percentage, 66.7)
    assert.equal(snapshot.errorTypes[0].rate, 50)
    assert.equal(snapshot.errorTypes[0].perMinute, 2)
    assert.equal(snapshot.errorTypes[1].type, "provider.internal")
    assert.equal(snapshot.errorTypes[1].percentage, 33.3)
    assert.equal(snapshot.errorTypes[1].rate, 25)
  })

  it("counts retries, tool calls and turns per minute", () => {
    const tracker = new UsageTracker(0)
    const now = 10 * MINUTE
    tracker.startTurn("ses_a", now - 30_000)
    tracker.noteRetry("ses_a", now - 20_000)
    tracker.noteRetry("ses_a", now - 10_000)
    tracker.noteToolCall("ses_a", now - 10_000)
    tracker.noteToolCall("ses_a", now - 10_000)
    tracker.noteToolCall("ses_a", now - 10_000, true)
    // older than the window
    tracker.noteRetry("ses_a", now - 6 * MINUTE)
    tracker.noteToolCall("ses_a", now - 6 * MINUTE)
    tracker.startTurn("ses_a", now - 6 * MINUTE)

    const snapshot = tracker.snapshot(now, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.retries, 3)
    assert.equal(snapshot.retryRpm, 2)
    assert.equal(snapshot.retryRpm5m, 0.4)
    assert.equal(snapshot.toolCalls, 4)
    assert.equal(snapshot.toolRpm, 3)
    assert.equal(snapshot.toolRpm5m, 0.6)
    assert.equal(snapshot.toolFailures, 1)
    assert.equal(snapshot.turnRpm, 1)
    assert.equal(snapshot.turnRpm5m, 0.2)
    assert.equal(snapshot.sessionList[0].turns, 2)
  })

  it("keeps the lifetime turn count when the turn list is trimmed", () => {
    const tracker = new UsageTracker(0, { maxTurnsPerSession: 2, maxRequests: 100 })
    for (let index = 0; index < 5; index++) {
      tracker.startTurn("ses_a", 1_000 + index)
      tracker.endTurn("ses_a", 1_500 + index, "succeeded")
    }

    const snapshot = tracker.snapshot(10_000, { kind: "session", sessionID: "ses_a" })
    assert.equal(snapshot.turns.length, 2)
    assert.equal(snapshot.turnCount, 5)
    assert.equal(snapshot.sessionList[0].turns, 5)
  })
})

