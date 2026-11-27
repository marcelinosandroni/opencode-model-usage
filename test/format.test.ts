import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatCompact, formatCost, formatCount, formatDuration, formatReport } from "../src/format.ts"
import type { UsageSnapshot } from "../src/usage.ts"

const snapshot = (overrides: Partial<UsageSnapshot> = {}): UsageSnapshot => ({
  generatedAt: 1_700_000_000_000,
  scope: "session",
  sessionID: "ses_a",
  trackedSince: 1_699_000_000_000,
  sessions: 1,
  requests: 12,
  failedRequests: 1,
  rpm: 3,
  rpm5m: 2.5,
  avgRpm: 1.5,
  tokens: { input: 128_400, output: 12_900, reasoning: 4_100, cacheRead: 210_000, cacheWrite: 0, total: 141_300 },
  cost: 0.4213,
  usageSource: "server",
  errors: 1,
  executionErrors: 0,
  retries: 2,
  toolCalls: 5,
  toolFailures: 1,
  avgLatencyMs: 3_200,
  avgTtftMs: 820,
  turnCount: 3,
  turns: [],
  models: [],
  sessionList: [],
  errorRate: 8.3,
  errorRpm: 1,
  errorRpm5m: 0.4,
  retryRpm: 2,
  retryRpm5m: 0.8,
  toolRpm: 3,
  toolRpm5m: 1.2,
  turnRpm: 1,
  turnRpm5m: 0.4,
  errorTypes: [],
  tracked: {
    requests: 12,
    failedRequests: 1,
    tokens: { input: 128_400, output: 12_900, reasoning: 4_100, cacheRead: 210_000, cacheWrite: 0, total: 141_300 },
    cost: 0.4213,
  },
  ...overrides,
})

describe("format helpers", () => {
  it("formats counts", () => {
    assert.equal(formatCount(999), "999")
    assert.equal(formatCount(1_200), "1.2k")
    assert.equal(formatCount(3_400_000), "3.4M")
    assert.equal(formatCount(0), "0")
  })

  it("formats costs", () => {
    assert.equal(formatCost(0), "$0")
    assert.equal(formatCost(0.0012), "$0.001200")
    assert.equal(formatCost(0.4213), "$0.4213")
    assert.equal(formatCost(1.5), "$1.50")
  })

  it("formats durations", () => {
    assert.equal(formatDuration(0), "0ms")
    assert.equal(formatDuration(820), "820ms")
    assert.equal(formatDuration(3_200), "3.2s")
    assert.equal(formatDuration(125_000), "2m 05s")
    assert.equal(formatDuration(7_500_000), "2h 05m")
  })

  it("formats a compact line", () => {
    const line = formatCompact(snapshot())
    assert.match(line, /session ses_a/)
    assert.match(line, /3 req\/min/)
    assert.match(line, /12 req/)
    assert.match(line, /in 128\.4k/)
    assert.match(line, /\$0\.4213/)
  })

  it("formats a full report", () => {
    const report = formatReport(
      snapshot({
        turns: [
          {
            index: 3,
            startedAt: 1_699_900_000_000,
            endedAt: 1_699_900_008_000,
            durationMs: 8_000,
            outcome: "succeeded",
            requests: 4,
            failedRequests: 0,
            executionErrors: 0,
            tokens: { input: 12_000, output: 1_200, reasoning: 300, cacheRead: 0, cacheWrite: 0, total: 13_200 },
            cost: 0.031,
            retries: 0,
            toolCalls: 2,
            toolFailures: 0,
            running: false,
          },
        ],
        models: [
          {
            providerID: "nvidia",
            modelID: "nvidia/test",
            requests: 12,
            failedRequests: 1,
            errors: 1,
            tokens: { input: 128_400, output: 12_900, reasoning: 4_100, cacheRead: 210_000, cacheWrite: 0, total: 141_300 },
            cost: 0.4213,
            avgLatencyMs: 3_200,
            avgTtftMs: 820,
          },
        ],
      }),
    )

    assert.match(report, /Uso do modelo — sessão ses_a/)
    assert.match(report, /3 req\/min \(janela de 60s\)/)
    assert.match(report, /entrada 128\.4k/)
    assert.match(report, /total 141\.3k/)
    assert.match(report, /Custo: \$0\.4213 \(origem: sessão do servidor\)/)
    assert.match(report, /Turnos:/)
    assert.match(report, /#3 · 4 req/)
    assert.match(report, /Modelos:/)
    assert.match(report, /nvidia\/nvidia\/test/)
  })

  it("lists the tracked sessions", () => {
    const report = formatReport(
      snapshot({
        scope: "all",
        sessionID: undefined,
        sessionList: [
          {
            sessionID: "ses_a",
            startedAt: 1_699_000_000_000,
            lastActivityAt: 1_700_000_000_000,
            requests: 12,
            failedRequests: 1,
            tokens: { input: 128_400, output: 12_900, reasoning: 4_100, cacheRead: 210_000, cacheWrite: 0, total: 141_300 },
            cost: 0.4213,
            usageSource: "server",
            errors: 1,
            executionErrors: 0,
            retries: 2,
            toolCalls: 5,
            toolFailures: 1,
            turns: 3,
            runningTurns: 1,
            avgLatencyMs: 3_200,
            avgTtftMs: 820,
            rpm: 3,
            rpm5m: 2.4,
            errorRate: 8.3,
            errorRpm: 1,
            retryRpm: 2,
            retryRpm5m: 0.8,
            toolRpm: 3,
            toolRpm5m: 1.2,
            turnRpm: 1,
            turnRpm5m: 0.4,
            errorTypes: [],
          },
        ],
      }),
    )

    assert.match(report, /Sessões:/)
    assert.match(report, /ses_a · 12 req/)
    assert.match(report, /3 turnos/)
    assert.match(report, /origem servidor/)
    assert.match(report, /em andamento/)
  })

  it("lists the errors by type with their share", () => {
    const report = formatReport(
      snapshot({
        errorTypes: [
          { type: "provider.rate-limit", count: 2, percentage: 66.7, rate: 16.7, perMinute: 1 },
          { type: "provider.internal", count: 1, percentage: 33.3, rate: 8.3, perMinute: 0 },
        ],
      }),
    )

    assert.match(report, /Erros por tipo:/)
    assert.match(report, /provider\.rate-limit · 2 \(66\.7% dos erros · 16\.7% das requisições\) · 1\/min/)
    assert.match(report, /provider\.internal · 1 \(33\.3% dos erros · 8\.3% das requisições\) · 0\/min/)
    assert.match(report, /Erros: 1 \(1\/min/)
    assert.match(report, /Retries: 2 \(2\/min/)
    assert.match(report, /Chamadas de ferramenta: 5 \(3\/min/)
  })
})
