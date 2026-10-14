import * as NodeReadline from "node:readline";
import * as NodeFS from "node:fs";

const send = (value) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...value })}\n`);
const reply = (id, result) => send({ id, result });
const update = (sessionId, update) =>
  send({ method: "session/update", params: { sessionId, update } });
const sessions = new Map();
const pending = new Map();
let counter = 0;
// Hermes keeps each profile's sessions in that profile's home.
const profileFlag = process.argv.indexOf("--profile");
const profile = profileFlag >= 0 ? process.argv[profileFlag + 1] : "active";
const ownsSession = (sessionId) => sessionId.startsWith(`hermes-${profile}-`);
const models = {
  currentModelId: "openrouter:test-model",
  availableModels: [
    { modelId: "openrouter:test-model", name: "Test Model" },
    { modelId: "local:other", name: "Other Model" },
  ],
};
const configOptions = process.env.HERMES_TEST_NO_REASONING
  ? []
  : [
      {
        id: "reasoning_effort",
        name: "Reasoning effort",
        type: "select",
        currentValue: "default",
        options: [
          "default",
          "none",
          "minimal",
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
          "ultra",
        ].map((value) => ({ value, name: value })),
      },
    ];
const modes = {
  currentModeId: "default",
  availableModes: ["default", "accept_edits", "dont_ask"].map((id) => ({ id, name: id })),
};
function complete(id, sid, text = "Hello Hermes") {
  update(sid, {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Thinking" },
  });
  update(sid, {
    sessionUpdate: "tool_call",
    toolCallId: "tool-1",
    title: "Read file",
    kind: "read",
    status: "in_progress",
  });
  update(sid, { sessionUpdate: "tool_call_update", toolCallId: "tool-1", status: "completed" });
  update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
  reply(id, {
    stopReason: "end_turn",
    ...(text === "Error: backend unavailable"
      ? {}
      : { usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } }),
  });
}
NodeReadline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (process.env.HERMES_TEST_LOG) NodeFS.appendFileSync(process.env.HERMES_TEST_LOG, `${line}\n`);
  if (!request.method) {
    const active = pending.get(request.id);
    if (active) {
      pending.delete(request.id);
      complete(active.id, active.sid, JSON.stringify(request.result));
    }
    return;
  }
  const { id, method, params = {} } = request;
  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: 1,
        agentInfo: { name: "hermes-agent", version: "1.0.0" },
        agentCapabilities: {
          loadSession: !process.env.HERMES_TEST_NO_LOAD,
          promptCapabilities: { image: !process.env.HERMES_TEST_NO_IMAGE },
        },
        authMethods: process.env.HERMES_TEST_NO_AUTH
          ? [{ id: "hermes-setup", name: "Setup" }]
          : [
              { id: "openrouter", name: "Runtime credentials" },
              { id: "hermes-setup", name: "Setup" },
            ],
      });
      break;
    case "authenticate":
      if (params.methodId !== "openrouter")
        send({ id, error: { code: -32000, message: "Wrong authentication method" } });
      else reply(id, {});
      break;
    case "session/new": {
      const sid = `hermes-${profile}-${process.pid}-${++counter}`;
      sessions.set(sid, {});
      reply(id, { sessionId: sid, models, modes, configOptions });
      update(sid, {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "model", description: "Switch models", input: { hint: "model name" } },
          { name: "compress", description: "Compress conversation context" },
        ],
      });
      break;
    }
    case "session/load":
      // Like Hermes, an unknown session loads as an empty result, not an error.
      if (!ownsSession(params.sessionId)) {
        reply(id, {});
        break;
      }
      sessions.set(params.sessionId, {});
      update(params.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "OLD REPLAY" },
      });
      reply(id, { models, modes, configOptions });
      break;
    case "session/set_mode":
      update(params.sessionId, {
        sessionUpdate: "current_mode_update",
        currentModeId: params.modeId,
      });
      reply(id, {});
      break;
    case "session/set_config_option":
      configOptions[0].currentValue = params.value;
      reply(id, { configOptions });
      break;
    case "session/set_model":
      reply(id, {});
      break;
    case "session/prompt": {
      const raw = params.prompt[0]?.text ?? "";
      const text = /<user_request>\n([\s\S]*)\n<\/user_request>/.exec(raw)?.[1] ?? raw;
      if (text === "caught-error") {
        complete(id, params.sessionId, "Error: backend unavailable");
        break;
      }
      if (text === "error") {
        send({ id, error: { code: -32000, message: "Backend rejected credentials" } });
        break;
      }
      if (text === "crash") {
        process.exit(2);
      }
      if (text === "hang") {
        sessions.set(params.sessionId, { id });
        update(params.sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "RUNNING" },
        });
      } else if (text === "permission") {
        const requestId = `approval-${id}`;
        pending.set(requestId, { id, sid: params.sessionId });
        send({
          id: requestId,
          method: "session/request_permission",
          params: {
            sessionId: params.sessionId,
            toolCall: {
              toolCallId: "write-1",
              title: "Write file",
              kind: "edit",
              status: "pending",
            },
            options: [
              { optionId: "allow_once", name: "Once", kind: "allow_once" },
              { optionId: "allow_always", name: "Permanent", kind: "allow_always" },
              { optionId: "allow_session", name: "Session", kind: "allow_always" },
              { optionId: "deny", name: "Deny", kind: "reject_once" },
            ],
          },
        });
      } else complete(id, params.sessionId);
      break;
    }
    case "session/cancel": {
      if (process.env.HERMES_TEST_IGNORE_CANCEL) {
        update(params.sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "CANCEL_RECEIVED" },
        });
        break;
      }
      const active = sessions.get(params.sessionId);
      if (active?.id) {
        reply(active.id, { stopReason: "cancelled" });
        sessions.set(params.sessionId, {});
      }
      break;
    }
    default:
      if (id !== undefined)
        send({ id, error: { code: -32601, message: `Unknown method ${method}` } });
  }
});
