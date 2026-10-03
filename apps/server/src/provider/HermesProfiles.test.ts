import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  discoverHermesProfiles,
  isHermesProfileName,
  selectedHermesProfile,
  withHermesProfiles,
} from "./HermesProfiles.ts";

it.effect("discovers only live profile directories from root and profile homes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    for (const name of ["work", "personal", "deleted", "invalid name", ".deleted"]) {
      yield* fs.makeDirectory(path.join(root, "profiles", name), { recursive: true });
    }
    yield* fs.writeFileString(path.join(root, "profiles", ".deleted", "deleted"), "");
    yield* fs.writeFileString(path.join(root, "profiles", "file"), "");
    assert.deepEqual(yield* discoverHermesProfiles(root), ["default", "personal", "work"]);
    assert.deepEqual(yield* discoverHermesProfiles(path.join(root, "profiles", "work")), [
      "default",
      "personal",
      "work",
    ]);
    assert.deepEqual(yield* discoverHermesProfiles(path.join(root, "missing")), ["default"]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it("keeps profile choices on custom models and replaces stale discovery", () => {
  const models = withHermesProfiles(
    [{ slug: "custom", name: "Custom", isCustom: true, capabilities: null }],
    ["default", "old"],
  );
  const refreshed = withHermesProfiles(models, ["default", "work"]);
  const descriptors = refreshed[0]?.capabilities?.optionDescriptors;
  assert.equal(descriptors?.length, 1);
  const descriptor = descriptors?.[0];
  assert.equal(descriptor?.type, "select");
  if (descriptor?.type === "select")
    assert.deepEqual(
      descriptor.options.map((option) => option.id),
      ["default", "work"],
    );
  assert.equal(selectedHermesProfile([{ id: "hermesProfile", value: "work" }]), "work");
  assert.equal(
    selectedHermesProfile([{ id: "hermesProfile", value: "__configured__" }]),
    "default",
  );
  assert.equal(selectedHermesProfile(undefined), "default");
  assert.isFalse(isHermesProfileName("../work"));
});
