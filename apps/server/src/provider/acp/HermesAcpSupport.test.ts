import { describe, expect, it } from "@effect/vitest";
import { HermesSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as AcpSchema from "effect-acp/compat";
import {
  buildHermesAcpSpawnInput,
  hermesApprovalOptions,
  hermesAuthMethod,
  hermesPermissionResponse,
} from "./HermesAcpSupport.ts";

const decodeSettings = Schema.decodeSync(HermesSettings);
const permission: AcpSchema.RequestPermissionRequest = {
  sessionId: "test",
  toolCall: { toolCallId: "test", title: "Edit", kind: "edit" },
  options: [
    { kind: "allow_once", optionId: "allow_once", name: "Once" },
    { kind: "allow_always", optionId: "allow_always", name: "Permanent" },
    { kind: "reject_once", optionId: "deny", name: "Deny" },
  ],
};
describe("Hermes ACP boundary", () => {
  it("preserves environment credentials and isolates explicitly configured homes", () => {
    const env = { HERMES_HOME: "/default-home", PATH: "/bin", TEST_CREDENTIAL: "test" };
    const a = buildHermesAcpSpawnInput(
      decodeSettings({ homePath: "/home-a", binaryPath: "/bin/hermes" }),
      "/workspace",
      env,
    );
    const b = buildHermesAcpSpawnInput(decodeSettings({ homePath: "/home-b" }), "/workspace", env);
    const inherited = buildHermesAcpSpawnInput(decodeSettings({}), "/workspace", env);
    expect(a).toMatchObject({
      command: "/bin/hermes",
      args: ["--profile", "default", "acp"],
      cwd: "/workspace",
      env: { HERMES_HOME: "/home-a", TEST_CREDENTIAL: "test" },
    });
    expect(b.env?.HERMES_HOME).toBe("/home-b");
    expect(inherited.env?.HERMES_HOME).toBe("/default-home");
    expect(env.HERMES_HOME).toBe("/default-home");
  });
  it("selects named and default profiles explicitly without changing the launch root", () => {
    for (const profile of ["work", "default"]) {
      const spawn = buildHermesAcpSpawnInput(
        { ...decodeSettings({ homePath: "/custom/hermes" }), profile },
        "/workspace",
      );
      expect(spawn.args).toEqual(["--profile", profile, "acp"]);
      expect(spawn.env?.HERMES_HOME).toBe("/custom/hermes");
    }
    expect(buildHermesAcpSpawnInput(decodeSettings({}), "/workspace").args).toEqual([
      "--profile",
      "default",
      "acp",
    ]);
  });
  it("never turns an approval into Hermes' permanent allowlist", () => {
    const selected = (optionId: string) => ({
      outcome: { outcome: "selected" as const, optionId },
    });
    expect(hermesPermissionResponse(permission, selected("allow_always"))).toEqual(
      selected("allow_once"),
    );
    const withSession = {
      ...permission,
      options: [
        ...permission.options,
        { kind: "allow_always" as const, optionId: "allow_session", name: "Session" },
      ],
    };
    expect(hermesPermissionResponse(withSession, selected("allow_always"))).toEqual(
      selected("allow_session"),
    );
    expect(hermesPermissionResponse(withSession, selected("allow_session"))).toEqual(
      selected("allow_session"),
    );
    expect(hermesPermissionResponse(permission, selected("deny"))).toEqual(selected("deny"));
    expect(
      hermesPermissionResponse(
        {
          ...permission,
          options: permission.options.filter(({ kind }) => kind === "allow_always"),
        },
        selected("allow_always"),
      ),
    ).toEqual({ outcome: { outcome: "cancelled" } });
    expect(hermesApprovalOptions(permission).map(({ decision }) => decision)).toEqual([
      "cancel",
      "decline",
      "accept",
    ]);
    expect(hermesApprovalOptions(withSession).map(({ decision }) => decision)).toContain(
      "acceptForSession",
    );
  });
  it.effect("selects the configured inference provider without hard-coding OpenRouter", () =>
    Effect.gen(function* () {
      const method = yield* hermesAuthMethod({
        protocolVersion: 1,
        agentCapabilities: {},
        authMethods: [
          { id: "hermes-setup", name: "Setup" },
          { id: "local", name: "Local" },
        ],
      });
      expect(method).toBe("local");
    }),
  );
  it.effect("never chooses an interactive terminal login during runtime authentication", () =>
    Effect.gen(function* () {
      const terminal = { id: "vendor-login", name: "Interactive login", type: "terminal" as const };
      const response = { protocolVersion: 1, agentCapabilities: {}, authMethods: [terminal] };
      const missing = yield* hermesAuthMethod(response).pipe(Effect.result);
      expect(missing._tag).toBe("Failure");
      expect(
        yield* hermesAuthMethod({
          ...response,
          authMethods: [terminal, { id: "custom", name: "Configured runtime" }],
        }),
      ).toBe("custom");
    }),
  );
});
