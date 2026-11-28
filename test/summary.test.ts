import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  composeDaily,
  DEFAULT_DAILY,
  minutesOfDay,
  parseTimeOfDay,
  renderDaily,
  resolveDailyOptions,
} from "../src/summary.ts"
import { MINUTE, UsageTracker } from "../src/usage.ts"

const tokens = (input: number, output: number, reasoning = 0, cacheRead = 0, cacheWrite = 0) => ({
  input,
  output,
  reasoning,
  cacheRead,
  cacheWrite,
})

const emptyBucket = (date: string) => ({
  date,
  requests: 0,
  failedRequests: 0,
  errors: 0,
  executionErrors: 0,
  retries: 0,
  toolCalls: 0,
  toolFailures: 0,
  turns: 0,
  tokens: tokens(0, 0),
  cost: 0,
})

describe("daily summary options", () => {
  it("defaults to enabled at 20:00", () => {
    const options = resolveDailyOptions(undefined)
    assert.equal(options.enabled, true)
    assert.equal(options.at, "20:00")
    assert.equal(options.title, DEFAULT_DAILY.title)
    assert.equal(options.body, DEFAULT_DAILY.body)
    assert.equal(options.timeZone, undefined)
  })

  it("accepts a custom time and zone, rejecting invalid ones", () => {
    const options = resolveDailyOptions({ at: "7:30", timeZone: "America/Sao_Paulo" })
    assert.equal(options.at, "7:30")
    assert.equal(options.timeZone, "America/Sao_Paulo")
    assert.equal(resolveDailyOptions({ at: "25:00" }).at, DEFAULT_DAILY.at)
    assert.equal(resolveDailyOptions({ at: "二十時" }).at, DEFAULT_DAILY.at)
    assert.equal(resolveDailyOptions({ timeZone: "Marte/Olympus" }).timeZone, undefined)
  })

  it("parses the time of day into minutes", () => {
    assert.equal(parseTimeOfDay("20:00"), 1200)
    assert.equal(parseTimeOfDay("00:00"), 0)
    assert.equal(parseTimeOfDay("7:05"), 425)
    assert.equal(parseTimeOfDay("20:60"), undefined)
    assert.equal(parseTimeOfDay(20), undefined)
  })

  it("reads minutes of a day in a zone", () => {
    // São Paulo is UTC-3 all year: 23:00 UTC is 20:00 there.
    const at = Date.UTC(2026, 10, 27, 23, 0)
    assert.equal(minutesOfDay(at, "America/Sao_Paulo"), 1200)
    assert.equal(minutesOfDay(at, "UTC"), 1380)
  })
})

describe("daily summary message", () => {
  it("renders the placeholders from a day bucket", () => {
    const bucket = {
      ...emptyBucket("2026-11-27"),
      requests: 12,
      failedRequests: 2,
      errors: 2,
      retries: 5,
      toolCalls: 17,
      turns: 3,
      tokens: tokens(1_284_000, 12_900, 4_100, 210_000, 0),
      cost: 0.4213,
    }
    const message = composeDaily(resolveDailyOptions({}), bucket, Date.UTC(2026, 10, 27, 22, 0))
    assert.ok(message.title.startsWith("Uso do modelo · 27/11/2026"))
    assert.match(message.body, /12 req \(3 turnos\)/)
    assert.match(message.body, /in 1\.3M/)
    assert.match(message.body, /out 12\.9k/)
    assert.match(message.body, /2 erros/)
    assert.match(message.body, /5 retries/)
    assert.match(message.body, /17 tools/)
    assert.match(message.body, /\$0\.4213/)
  })

  it("respects custom templates and unknown placeholders", () => {
    const options = resolveDailyOptions({ title: "Uso {requests}", body: "falhas {failed} · {olá}" })
    const message = composeDaily(options, { ...emptyBucket("2026-11-27"), requests: 4, failedRequests: 1 })
    assert.equal(message.title, "Uso 4")
    assert.equal(message.body, "falhas 1 · {olá}")
  })

  it("clips the title and body to the lock screen caps", () => {
    const options = resolveDailyOptions({ title: "x".repeat(200), body: "y".repeat(500) })
    const message = composeDaily(options, emptyBucket("2026-11-27"))
    assert.ok(message.title.length <= 80)
    assert.ok(message.body.length <= 300)
  })
})

describe("day buckets", () => {
  it("accumulates the day's usage and prunes old days", () => {
    const tracker = new UsageTracker(0, { maxTurnsPerSession: 50, maxRequests: 1_000, timeZone: "UTC" })
    const day = 5 * 24 * 60 * MINUTE
    const key = tracker.dayKeyOf(day)
    tracker.startTurn("ses_a", day)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: day,
    })
    tracker.endRequest({ sessionID: "ses_a", messageID: "msg_1", endedAt: day + MINUTE, tokens: tokens(100, 10), cost: 0.5 })
    tracker.noteRetry("ses_a", day + 2 * MINUTE)
    tracker.noteToolCall("ses_a", day + 2 * MINUTE, true)

    const summary = tracker.daySummary(key)
    assert.equal(summary.date, key)
    assert.equal(summary.requests, 1)
    assert.equal(summary.turns, 1)
    assert.equal(summary.retries, 1)
    assert.equal(summary.toolCalls, 1)
    assert.equal(summary.toolFailures, 1)
    assert.equal(summary.tokens.input, 100)
    assert.equal(summary.cost, 0.5)

    // Nine days of activity keep only the last seven buckets.
    for (let offset = 1; offset <= 9; offset += 1) {
      const at = day + offset * 24 * 60 * MINUTE
      tracker.startRequest({
        sessionID: "ses_a",
        messageID: `msg_day_${offset}`,
        agent: "build",
        providerID: "nvidia",
        modelID: "nvidia/test",
        startedAt: at,
      })
    }
    assert.equal(tracker.dayKeys().length, 7)
    assert.equal(tracker.dayKeys()[0], tracker.dayKeyOf(day + 3 * 24 * 60 * MINUTE))
    assert.equal(tracker.daySummary(key).requests, 0)
  })

  it("buckets by the configured time zone", () => {
    const utcNoon = Date.UTC(2026, 10, 27, 12, 0)
    const utc = new UsageTracker(0, { maxTurnsPerSession: 50, maxRequests: 1_000, timeZone: "UTC" })
    const saoPaulo = new UsageTracker(0, { maxTurnsPerSession: 50, maxRequests: 1_000, timeZone: "America/Sao_Paulo" })
    assert.equal(utc.dayKeyOf(utcNoon), "2026-11-27")
    assert.equal(saoPaulo.dayKeyOf(utcNoon), "2026-11-27")
    // 02:00 UTC is still the previous day in São Paulo.
    const utcSmallHours = Date.UTC(2026, 10, 28, 2, 0)
    assert.equal(utc.dayKeyOf(utcSmallHours), "2026-11-28")
    assert.equal(saoPaulo.dayKeyOf(utcSmallHours), "2026-11-27")
  })

  it("counts failures and execution errors in the day", () => {
    const tracker = new UsageTracker(0, { maxTurnsPerSession: 50, maxRequests: 1_000, timeZone: "UTC" })
    tracker.startTurn("ses_a", 1_000)
    tracker.noteExecutionError("ses_a", "provider.no-route", 1_500)
    tracker.startRequest({
      sessionID: "ses_a",
      messageID: "msg_1",
      agent: "build",
      providerID: "nvidia",
      modelID: "nvidia/test",
      startedAt: 2_000,
    })
    tracker.failRequest({ sessionID: "ses_a", messageID: "msg_1", endedAt: 2_500, errorType: "provider.rate-limit" })

    const summary = tracker.daySummary(tracker.dayKeyOf(2_500))
    assert.equal(summary.requests, 1)
    assert.equal(summary.failedRequests, 1)
    assert.equal(summary.errors, 2)
    assert.equal(summary.executionErrors, 1)
  })
})
