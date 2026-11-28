import { Plugin } from "@opencode/plugin"
import { formatCompact, formatReport } from "./format.js"
import { modelAllowed, resolveOptions, type ResolvedOptions } from "./options.js"
import { PhoneNotifySend, type PhoneSendResult } from "./notify.js"
import { ModelUsage } from "./rpc.js"
import { composeDaily, minutesOfDay, parseTimeOfDay, resolveDailyOptions } from "./summary.js"
import { tokensFromUsage, serializeSnapshot, UsageTracker, type SnapshotScope, type UsageSnapshot } from "./usage.js"

const log = (level: "info" | "warn" | "error", message: string, details: Record<string, unknown> = {}) => {
  const line = `[opencode.model-usage] ${message}`
  if (level === "error") console.error(line, details)
  else if (level === "warn") console.warn(line, details)
  else console.info(line, details)
}

type ToolInput = {
  scope?: "all" | "session"
  sessionID?: string
  format?: "report" | "compact"
}

const parseToolInput = (value: unknown): ToolInput => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const scope = input.scope === "all" || input.scope === "session" ? input.scope : undefined
  const format = input.format === "compact" || input.format === "report" ? input.format : undefined
  const sessionID = typeof input.sessionID === "string" && input.sessionID.length > 0 ? input.sessionID : undefined
  return { scope, format, sessionID }
}

/**
 * Tracks model usage from public OpenCode events.
 *
 * A request is one model step, a turn is one execution, and a session groups
 * turns. The plugin never changes prompts, models or permissions: it only
 * reads the public event stream and exposes the numbers it derives.
 */
export default Plugin.define({
  id: "opencode.model-usage",
  async setup(ctx) {
    const options: ResolvedOptions = resolveOptions(ctx.options)
    if (!options.enabled) {
      log("info", "disabled by configuration")
      return
    }

    const daily = resolveDailyOptions((ctx.options as Record<string, unknown>)?.dailySummary)
    const tracker = new UsageTracker(Date.now(), {
      maxTurnsPerSession: options.maxTurnsPerSession,
      maxRequests: options.maxRequests,
      timeZone: daily.timeZone,
    })
    const controller = new AbortController()

    log("info", "enabled", {
      logInterval: options.logInterval,
      providerIDs: [...options.providerIDs],
      modelIDs: [...options.modelIDs],
      trackTools: options.trackTools,
      dailySummary: daily.enabled ? daily.at : "off",
    })

    const scopeFor = (scope: ToolInput, fallbackSessionID: string): SnapshotScope => {
      if (scope.scope === "all") return { kind: "all" }
      const sessionID = scope.sessionID ?? fallbackSessionID
      return { kind: "session", sessionID }
    }

    const snapshot = (scope: SnapshotScope): UsageSnapshot => tracker.snapshot(Date.now(), scope)

    const events = ctx.event.subscribe({
      types: [
        "session.step.started",
        "session.step.first-token",
        "session.step.ended",
        "session.step.failed",
        "session.execution.started",
        "session.execution.succeeded",
        "session.execution.failed",
        "session.execution.interrupted",
        "session.retry.scheduled",
        "session.tool.called",
        "session.tool.failed",
        "session.usage.updated",
        "session.deleted",
      ],
      signal: controller.signal,
    })

    void (async () => {
      try {
        for await (const event of events) {
          if (controller.signal.aborted) break
          switch (event.type) {
            case "session.step.started": {
              const model = event.data.model
              if (!modelAllowed(model.providerID, model.id, options)) break
              tracker.startRequest({
                sessionID: event.data.sessionID,
                messageID: event.data.assistantMessageID,
                agent: event.data.agent,
                providerID: model.providerID,
                modelID: model.id,
                startedAt: event.data.started ?? event.created,
              })
              break
            }
            case "session.step.first-token": {
              tracker.markFirstToken({
                sessionID: event.data.sessionID,
                messageID: event.data.assistantMessageID,
                at: event.created,
              })
              break
            }
            case "session.step.ended": {
              tracker.endRequest({
                sessionID: event.data.sessionID,
                messageID: event.data.assistantMessageID,
                endedAt: event.created,
                tokens: tokensFromUsage(event.data.tokens),
                cost: event.data.cost,
                finish: event.data.finish,
              })
              break
            }
            case "session.step.failed": {
              tracker.failRequest({
                sessionID: event.data.sessionID,
                messageID: event.data.assistantMessageID,
                endedAt: event.created,
                tokens: event.data.tokens ? tokensFromUsage(event.data.tokens) : undefined,
                cost: event.data.cost,
                finish: event.data.finish,
                errorType: event.data.error.type,
              })
              break
            }
            case "session.execution.started": {
              tracker.startTurn(event.data.sessionID, event.created)
              break
            }
            case "session.execution.succeeded": {
              tracker.endTurn(event.data.sessionID, event.created, "succeeded")
              break
            }
            case "session.execution.failed": {
              tracker.noteExecutionError(event.data.sessionID, event.data.error.type, event.created)
              tracker.endTurn(event.data.sessionID, event.created, "failed")
              break
            }
            case "session.execution.interrupted": {
              tracker.endTurn(event.data.sessionID, event.created, "interrupted")
              break
            }
            case "session.retry.scheduled": {
              tracker.noteRetry(event.data.sessionID, event.data.at ?? event.created)
              break
            }
            case "session.tool.called": {
              if (!options.trackTools) break
              tracker.noteToolCall(event.data.sessionID, event.created, false)
              break
            }
            case "session.tool.failed": {
              if (!options.trackTools) break
              tracker.noteToolCall(event.data.sessionID, event.created, true)
              break
            }
            case "session.usage.updated": {
              tracker.syncSessionUsage(
                event.data.sessionID,
                tokensFromUsage(event.data.tokens),
                event.data.cost,
                event.created,
              )
              break
            }
            case "session.deleted": {
              tracker.removeSession(event.data.sessionID)
              break
            }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          log("error", "event subscription stopped", {
            error: cause instanceof Error ? cause.message : String(cause),
          })
        }
      }
    })()

    const tool = await ctx.tool.transform((editor) => {
      editor.add({
        name: "model_usage",
        description:
          "Show model usage metrics for the current session or for every session: requests per minute, input and output tokens per turn and session, reasoning and cache tokens, cost, latency, time to first token, errors by type with their percentage, retries, tool calls and turns per minute.",
        input: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["session", "all"],
              description: "session (default) reports the current session; all reports every tracked session.",
            },
            sessionID: {
              type: "string",
              description: "Session to report. Defaults to the session that called this tool.",
            },
            format: {
              type: "string",
              enum: ["report", "compact"],
              description: "report (default) prints the full breakdown; compact prints one line.",
            },
          },
          additionalProperties: false,
        },
        execute: async (input: unknown, toolContext) => {
          const parsed = parseToolInput(input)
          const current = snapshot(scopeFor(parsed, toolContext.sessionID))
          const content = parsed.format === "compact" ? formatCompact(current) : formatReport(current)
          return { content }
        },
      })
    })

    const rpc = await ctx.rpc.register(ModelUsage, {
      stats: async (input, context) => {
        const parsed = parseToolInput(input)
        if (parsed.scope === "session" && !parsed.sessionID) {
          throw context.error(
            "invalid_scope",
            "sessionID is required when scope is 'session'",
            { reason: "missing_session_id" },
          )
        }
        const scope: SnapshotScope =
          parsed.scope === "session"
            ? { kind: "session", sessionID: parsed.sessionID as string }
            : { kind: "all" }
        return serializeSnapshot(snapshot(scope))
      },
    })

    // Server command: any client that speaks the public command API (the web
    // app, the iOS app) can run it and gets the report as a message in the
    // session, without spending a model call.
    await ctx.command.transform((editor) => {
      editor.add({
        name: "model-usage",
        description: "Relatório de uso do modelo: RPM, tokens, custo, erros por tipo, retries e ferramentas",
        execute: async (input) => {
          const current = snapshot({ kind: "session", sessionID: input.sessionID })
          await ctx.session.synthetic({
            sessionID: input.sessionID,
            text: formatReport(current),
            description: "Uso do modelo",
          })
        },
      })
    })

    const timer =
      options.logInterval > 0
        ? setInterval(() => {
            const current = snapshot({ kind: "all" })
            if (current.requests === 0) return
            log("info", "usage summary", { summary: formatCompact(current) })
          }, options.logInterval)
        : undefined

    // ---- daily summary over the phone notifications plugin ----------------

    // Diagnostics: what the plugin actually received from the configuration.
    await ctx.storage.set("daily-summary:options", (ctx.options ?? null) as never).catch(() => undefined)

    let summaryTimer: ReturnType<typeof setInterval> | undefined
    if (daily.enabled) {
      const targetMinutes = parseTimeOfDay(daily.at) ?? 20 * 60
      let lastSentDate: string | undefined
      let lastAttemptAt = 0
      try {
        const stored = (await ctx.storage.get("daily-summary:last")) as { date?: string } | undefined
        lastSentDate = stored?.date
      } catch {
        // Without durable state the summary may repeat once after a restart; acceptable.
      }

      const send = async (): Promise<boolean> => {
        const client = ctx.rpc(PhoneNotifySend)
        const bucket = tracker.daySummary()
        const message = composeDaily(daily, bucket)
        try {
          const result = (await client.send({ title: message.title, body: message.body })) as PhoneSendResult
          if (result.sent) return true
          log("warn", "daily summary was not delivered", { targets: result.targets })
          await ctx.storage
            .set("daily-summary:last-attempt", { date: tracker.dayKeyOf(Date.now()), error: `not delivered (${result.targets} targets)` })
            .catch(() => undefined)
          return false
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : String(cause)
          log("warn", `daily summary could not be sent: ${error}`)
          await ctx.storage
            .set("daily-summary:last-attempt", { date: tracker.dayKeyOf(Date.now()), error })
            .catch(() => undefined)
          return false
        }
      }

      const tick = async (): Promise<void> => {
        const now = Date.now()
        const date = tracker.dayKeyOf(now)
        if (lastSentDate === date) return
        if (minutesOfDay(now, daily.timeZone) < targetMinutes) return
        // A failing relay must not be retried every tick.
        if (now - lastAttemptAt < 10 * 60_000) return
        lastAttemptAt = now
        if (await send()) {
          lastSentDate = date
          await ctx.storage.set("daily-summary:last", { date }).catch(() => undefined)
        }
      }

      summaryTimer = setInterval(() => {
        void tick().catch(() => undefined)
      }, 30_000)
      // The first check runs right away, so a server started after the
      // scheduled time sends the summary it missed instead of waiting a day.
      void tick().catch((cause) => log("warn", `daily summary tick failed: ${cause instanceof Error ? cause.message : String(cause)}`))
      await ctx.storage
        .set("daily-summary:armed", { at: daily.at, timeZone: daily.timeZone ?? "system", target: targetMinutes })
        .catch(() => undefined)
    }

    return async () => {
      controller.abort()
      if (timer) clearInterval(timer)
      if (summaryTimer) clearInterval(summaryTimer)
      await tool.dispose()
      await rpc.dispose()
    }
  },
})
