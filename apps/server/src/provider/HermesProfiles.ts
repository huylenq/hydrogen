import type { ProviderOptionSelection, ServerProviderModel } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const ProfileName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,63}$/));
export const isHermesProfileName = Schema.is(ProfileName);

export function selectedHermesProfile(options: ReadonlyArray<ProviderOptionSelection> | undefined) {
  const value = options?.find((option) => option.id === "hermesProfile")?.value;
  return typeof value === "string" && value !== "__configured__" && value !== ""
    ? value
    : "default";
}

export const discoverHermesProfiles = Effect.fn("discoverHermesProfiles")(function* (home: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root =
    path.basename(path.dirname(home)) === "profiles" ? path.dirname(path.dirname(home)) : home;
  const directory = path.join(root, "profiles");
  const names = yield* fs.readDirectory(directory).pipe(Effect.catch(() => Effect.succeed([])));
  const profiles = yield* Effect.filter(names.filter(isHermesProfileName), (name) =>
    Effect.gen(function* () {
      const stat = yield* fs.stat(path.join(directory, name));
      const deleted = yield* fs.exists(path.join(directory, ".deleted", name));
      return stat.type === "Directory" && !deleted;
    }).pipe(Effect.catch(() => Effect.succeed(false))),
  );
  return ["default", ...profiles.filter((name) => name !== "default").sort()];
});

export function withHermesProfiles(
  models: ReadonlyArray<ServerProviderModel>,
  profiles: ReadonlyArray<string>,
): ReadonlyArray<ServerProviderModel> {
  return models.map((model) => ({
    ...model,
    capabilities: {
      ...model.capabilities,
      optionDescriptors: [
        {
          id: "hermesProfile",
          label: "Agent profile",
          description: "Switching profiles starts a fresh Hermes session on your next message.",
          type: "select",
          currentValue: "default",
          options: profiles.map((name) => ({
            id: name,
            label: name,
            ...(name === "default" ? { isDefault: true } : {}),
          })),
        },
        ...(model.capabilities?.optionDescriptors ?? []).filter(
          (option) => option.id !== "hermesProfile",
        ),
      ],
    },
  }));
}
