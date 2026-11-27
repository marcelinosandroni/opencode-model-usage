import type {
  ErrorTypeSnapshot,
  ModelSnapshot,
  SessionSnapshot,
  TokenTotalsWithTotal,
  TurnSnapshot,
  UsageSnapshot,
} from "./usage.js"

/** Compact number formatting: 1.2k, 3.4M. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (abs >= 1_000) return `${trim(value / 1_000)}k`
  return `${Math.round(value)}`
}

const trim = (value: number) => {
  const fixed = value.toFixed(1)
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed
}

export function formatCost(value: number): string {
  if (!Number.isFinite(value)) return "$0"
  if (value === 0) return "$0"
  if (value < 0.01) return `$${value.toFixed(6)}`
  if (value < 1) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms"
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
}

export function formatTokens(tokens: TokenTotalsWithTotal): string {
  return `in ${formatCount(tokens.input)} · out ${formatCount(tokens.output)} · rac ${formatCount(tokens.reasoning)} · cache ${formatCount(tokens.cacheRead)}/${formatCount(tokens.cacheWrite)}`
}

/** One-line summary used by logs and status lines. */
export function formatCompact(snapshot: UsageSnapshot): string {
  const scope = snapshot.scope === "session" ? `session ${snapshot.sessionID}` : `all (${snapshot.sessions} sessions)`
  const parts = [
    scope,
    `${snapshot.rpm} req/min`,
    `${snapshot.requests} req`,
    formatTokens(snapshot.tokens),
    formatCost(snapshot.cost),
  ]
  if (snapshot.errors > 0) parts.push(`${snapshot.errors} erros (${snapshot.errorRate}%)`)
  if (snapshot.retryRpm > 0) parts.push(`${snapshot.retryRpm} retry/min`)
  if (snapshot.toolRpm > 0) parts.push(`${snapshot.toolRpm} tools/min`)
  return parts.join(" · ")
}

/** Full report used by the tool and the RPC consumers. */
export function formatReport(snapshot: UsageSnapshot): string {
  const lines: string[] = []
  const title = snapshot.scope === "session" ? `Uso do modelo — sessão ${snapshot.sessionID}` : "Uso do modelo — todas as sessões"
  lines.push(title)
  lines.push(
    `Requisições: ${snapshot.rpm} req/min (janela de 60s) · ${snapshot.rpm5m} req/min (média de 5min) · ${snapshot.avgRpm} req/min (média)`,
  )
  lines.push(
    `Requisições totais: ${snapshot.requests} (${snapshot.failedRequests} falharam · ${snapshot.errorRate}% de erro) · sessões: ${snapshot.sessions} · acompanhando desde ${new Date(snapshot.trackedSince).toISOString()}`,
  )
  lines.push(
    `Erros: ${snapshot.errors} (${snapshot.errorRpm}/min · média de 5min ${snapshot.errorRpm5m}/min) · Retries: ${snapshot.retries} (${snapshot.retryRpm}/min · média de 5min ${snapshot.retryRpm5m}/min)`,
  )
  lines.push(
    `Chamadas de ferramenta: ${snapshot.toolCalls} (${snapshot.toolRpm}/min · média de 5min ${snapshot.toolRpm5m}/min) · Turnos: ${snapshot.turnCount} (${snapshot.turnRpm}/min · média de 5min ${snapshot.turnRpm5m}/min)`,
  )
  lines.push(
    `Tokens: entrada ${formatCount(snapshot.tokens.input)} · saída ${formatCount(snapshot.tokens.output)} · raciocínio ${formatCount(snapshot.tokens.reasoning)} · cache leitura ${formatCount(snapshot.tokens.cacheRead)} · cache escrita ${formatCount(snapshot.tokens.cacheWrite)} · total ${formatCount(snapshot.tokens.total)}`,
  )
  lines.push(`Custo: ${formatCost(snapshot.cost)} (origem: ${snapshot.usageSource === "server" ? "sessão do servidor" : "rastreado pelo plugin"})`)
  lines.push(
    `Latência: média ${formatDuration(snapshot.avgLatencyMs)} · TTFT médio ${formatDuration(snapshot.avgTtftMs)} · falhas de ferramenta ${snapshot.toolFailures}`,
  )

  if (snapshot.errorTypes.length > 0) {
    lines.push("")
    lines.push("Erros por tipo:")
    for (const error of snapshot.errorTypes) lines.push(`  ${formatErrorType(error)}`)
  }

  if (snapshot.turns.length > 0) {
    lines.push("")
    lines.push("Turnos:")
    for (const turn of snapshot.turns) lines.push(`  ${formatTurn(turn)}`)
  }

  if (snapshot.sessionList.length > 0) {
    lines.push("")
    lines.push("Sessões:")
    for (const session of snapshot.sessionList) lines.push(`  ${formatSession(session)}`)
  }

  if (snapshot.models.length > 0) {
    lines.push("")
    lines.push("Modelos:")
    for (const model of snapshot.models) lines.push(`  ${formatModel(model)}`)
  }

  return lines.join("\n")
}

export function formatErrorType(error: ErrorTypeSnapshot): string {
  return `${error.type} · ${error.count} (${error.percentage}% dos erros · ${error.rate}% das requisições) · ${error.perMinute}/min`
}

export function formatTurn(turn: TurnSnapshot): string {
  const outcome = turn.outcome ?? (turn.running ? "em andamento" : "sem desfecho")
  return `#${turn.index} · ${turn.requests} req (${turn.failedRequests} falharam) · ${formatTokens(turn.tokens)} · ${formatCost(turn.cost)} · ${formatDuration(turn.durationMs ?? 0)} · ${outcome}`
}

export function formatSession(session: SessionSnapshot): string {
  const source = session.usageSource === "server" ? "servidor" : "plugin"
  const running = session.runningTurns > 0 ? " · em andamento" : ""
  const errors = session.errors > 0 ? ` · ${session.errors} erros (${session.errorRate}%)` : ""
  return `${session.sessionID} · ${session.requests} req (${session.failedRequests} falharam) · ${formatTokens(session.tokens)} · ${formatCost(session.cost)} · lat ${formatDuration(session.avgLatencyMs)} · ${session.turns} turnos · retries ${session.retries} (${session.retryRpm}/min) · ferramentas ${session.toolCalls} (${session.toolRpm}/min)${errors} · origem ${source}${running}`
}

export function formatModel(model: ModelSnapshot): string {
  const latency = model.avgLatencyMs === 0 ? undefined : ` · lat ${formatDuration(model.avgLatencyMs)}`
  const ttft = model.avgTtftMs === 0 ? undefined : ` · ttft ${formatDuration(model.avgTtftMs)}`
  const errors = model.errors === 0 ? undefined : ` · ${model.errors} erros`
  return `${model.providerID}/${model.modelID} · ${model.requests} req · ${formatTokens(model.tokens)} · ${formatCost(model.cost)}${latency ?? ""}${ttft ?? ""}${errors ?? ""}`
}
