import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { formatCompact, formatReport } from "./format.js"
import { ModelUsage } from "./rpc.js"
import type { UsageSnapshot } from "./usage.js"

const REFRESH_INTERVAL = 5_000

/**
 * Terminal part of the usage tracker.
 *
 * It renders a live line in the prompt footer and adds a `/usage` command that
 * opens the same report the agent sees through the tool.
 */
export default Plugin.define({
  id: "opencode.model-usage.tui",
  setup(context) {
    const [snapshot, setSnapshot] = createSignal<UsageSnapshot | undefined>(undefined)
    let sessionID: string | undefined

    const load = async (target?: string) => {
      try {
        const result = await context.client.rpc(ModelUsage).stats(
          target ? { scope: "session", sessionID: target } : { scope: "all" },
        )
        setSnapshot(result as unknown as UsageSnapshot)
      } catch (cause) {
        console.error("[opencode.model-usage] could not read the usage stats", cause)
      }
    }

    const stopListening = context.data.on("session.step.ended", (event) => {
      sessionID = event.data.sessionID
      void load(sessionID)
    })

    const timer = setInterval(() => void load(sessionID), REFRESH_INTERVAL)

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "opencode.model-usage.show",
          title: "Show model usage",
          description: "Requests per minute, tokens and cost for the current session",
          group: "OpenCode",
          palette: true,
          // "/usage" belongs to the built-in usage limits dialog, so the
          // plugin uses its own slash name.
          slash: { name: "model-usage" },
          run: async () => {
            await load(sessionID)
            const current = snapshot()
            if (!current) {
              context.ui.toast.show({ message: "No usage data yet", variant: "warning" })
              return
            }
            await context.ui.dialog.alert({ title: "Uso do modelo", message: formatReport(current) })
          },
        },
      ],
    }))

    const releaseSlot = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        const current = snapshot()
        if (!current) return null
        return <text fg={context.theme.text.base}>{formatCompact(current)}</text>
      },
    })

    void load(sessionID)

    return () => {
      stopListening()
      clearInterval(timer)
      releaseSlot()
    }
  },
})
