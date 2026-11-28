import { Rpc } from "@opencode/plugin/rpc"

/**
 * The `send` method of the phone notifications plugin.
 *
 * This is a client-side mirror of the contract that
 * `github:marcelinosandroni/opencode-phone-notify` registers under the
 * `mobile-notifications` RPC id (the same id the OpenCode iOS app pairs
 * against). RPC routing goes by id, so this definition reaches the registered
 * handler without a package dependency. Keep the shapes in sync with
 * `opencode-phone-notify/src/contract.ts`.
 */
export const PhoneNotifySend = Rpc.define({
  id: "mobile-notifications",
  methods: {
    send: {
      input: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          sessionID: { type: "string" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sent: { type: "boolean" },
          encrypted: { type: "boolean" },
          targets: { type: "number" },
        },
        required: ["sent", "encrypted", "targets"],
        additionalProperties: false,
      },
      errors: {
        invalid_payload: {
          type: "object",
          properties: { reason: { type: "string" } },
          required: ["reason"],
          additionalProperties: false,
        },
      },
    },
  },
  events: {},
})

export type PhoneSendResult = { sent: boolean; encrypted: boolean; targets: number }
