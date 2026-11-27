import { Rpc } from "@opencode/plugin/rpc"

const tokensSchema = {
  type: "object",
  properties: {
    input: { type: "number" },
    output: { type: "number" },
    reasoning: { type: "number" },
    cacheRead: { type: "number" },
    cacheWrite: { type: "number" },
    total: { type: "number" },
  },
  required: ["input", "output", "reasoning", "cacheRead", "cacheWrite", "total"],
  additionalProperties: false,
} as const

const turnSchema = {
  type: "object",
  properties: {
    index: { type: "number" },
    startedAt: { type: "number" },
    endedAt: { type: "number" },
    durationMs: { type: "number" },
    outcome: { type: "string", enum: ["succeeded", "failed", "interrupted"] },
    requests: { type: "number" },
    failedRequests: { type: "number" },
    tokens: tokensSchema,
    cost: { type: "number" },
    retries: { type: "number" },
    toolCalls: { type: "number" },
    toolFailures: { type: "number" },
    running: { type: "boolean" },
  },
  required: [
    "index",
    "startedAt",
    "requests",
    "failedRequests",
    "tokens",
    "cost",
    "retries",
    "toolCalls",
    "toolFailures",
    "running",
  ],
  additionalProperties: false,
} as const

const modelSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    modelID: { type: "string" },
    requests: { type: "number" },
    failedRequests: { type: "number" },
    errors: { type: "number" },
    tokens: tokensSchema,
    cost: { type: "number" },
    avgLatencyMs: { type: "number" },
    avgTtftMs: { type: "number" },
  },
  required: [
    "providerID",
    "modelID",
    "requests",
    "failedRequests",
    "errors",
    "tokens",
    "cost",
    "avgLatencyMs",
    "avgTtftMs",
  ],
  additionalProperties: false,
} as const

/**
 * Public contract of the usage tracker. Clients can read the same numbers the
 * plugin shows in the terminal and to the agent.
 */
export const ModelUsage = Rpc.define({
  id: "model-usage",
  methods: {
    stats: {
      input: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["all", "session"] },
          sessionID: { type: "string" },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          generatedAt: { type: "number" },
          scope: { type: "string", enum: ["all", "session"] },
          sessionID: { type: "string" },
          trackedSince: { type: "number" },
          sessions: { type: "number" },
          requests: { type: "number" },
          failedRequests: { type: "number" },
          rpm: { type: "number" },
          rpm5m: { type: "number" },
          avgRpm: { type: "number" },
          tokens: tokensSchema,
          cost: { type: "number" },
          usageSource: { type: "string", enum: ["server", "tracked"] },
          errors: { type: "number" },
          retries: { type: "number" },
          toolCalls: { type: "number" },
          toolFailures: { type: "number" },
          avgLatencyMs: { type: "number" },
          avgTtftMs: { type: "number" },
          turns: { type: "array", items: turnSchema },
          models: { type: "array", items: modelSchema },
          tracked: {
            type: "object",
            properties: {
              requests: { type: "number" },
              failedRequests: { type: "number" },
              tokens: tokensSchema,
              cost: { type: "number" },
            },
            required: ["requests", "failedRequests", "tokens", "cost"],
            additionalProperties: false,
          },
        },
        required: [
          "generatedAt",
          "scope",
          "trackedSince",
          "sessions",
          "requests",
          "failedRequests",
          "rpm",
          "rpm5m",
          "avgRpm",
          "tokens",
          "cost",
          "usageSource",
          "errors",
          "retries",
          "toolCalls",
          "toolFailures",
          "avgLatencyMs",
          "avgTtftMs",
          "turns",
          "models",
          "tracked",
        ],
        additionalProperties: false,
      },
    },
  },
  events: {},
})

export type ModelUsageStatsInput = {
  scope?: "all" | "session"
  sessionID?: string
}
