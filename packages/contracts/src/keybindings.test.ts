import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings.ts";

const decode = <S extends Schema.Top>(
  schema: S,
  input: unknown,
): Effect.Effect<Schema.Schema.Type<S>, Schema.SchemaError, never> =>
  Schema.decodeUnknownEffect(schema as never)(input) as Effect.Effect<
    Schema.Schema.Type<S>,
    Schema.SchemaError,
    never
  >;

const shortcut = {
  key: "p",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  modKey: true,
};

it.effect("drops resolved rules with commands this build does not know", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingsConfig, [
      { command: "terminal.toggle", shortcut },
      { command: "someFuture.toggle", shortcut },
      { command: "filePicker.toggle", shortcut },
    ]);
    assert.deepEqual(
      parsed.map((rule) => rule.command),
      ["terminal.toggle", "filePicker.toggle"],
    );
  }),
);

it.effect("drops malformed resolved rule entries", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingsConfig, [
      "garbage",
      { command: "terminal.toggle", shortcut },
      null,
    ]);
    assert.deepEqual(
      parsed.map((rule) => rule.command),
      ["terminal.toggle"],
    );
  }),
);

it.effect("preserves the terminal reclaim Space key across the wire", () =>
  Effect.gen(function* () {
    const rules = [
      {
        command: "keyboard.normal" as const,
        shortcut: {
          key: " ",
          metaKey: false,
          ctrlKey: true,
          shiftKey: true,
          altKey: false,
          modKey: false,
        },
      },
    ];
    const encoded = yield* encodeResolvedKeybindings(rules);
    const decoded = yield* decode(ResolvedKeybindingsConfig, encoded);
    assert.deepStrictEqual(decoded, rules);
  }),
);

it.effect("migrates saved queue bindings and writes the canonical Flow command", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(KeybindingRule, {
      key: "alt+l",
      command: "workQueue.toggle",
      when: "!terminalFocus",
    });
    assert.deepStrictEqual(parsed, {
      key: "alt+l",
      command: "flow.toggle",
      when: "!terminalFocus",
    });
    const encoded = yield* encodeKeybindingRule(parsed);
    assert.deepStrictEqual(encoded, parsed);
  }),
);

const encodeKeybindingRule = Schema.encodeEffect(KeybindingRule);
const encodeResolvedKeybindings = Schema.encodeEffect(ResolvedKeybindingsConfig);
