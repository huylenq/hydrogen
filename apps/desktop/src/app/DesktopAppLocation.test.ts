import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import {
  DESKTOP_APP_LOCATION_FILE_NAME,
  recordDesktopAppLocation,
  resolveMacAppBundlePath,
} from "./DesktopAppLocation.ts";

describe("resolveMacAppBundlePath", () => {
  it("finds the dev launcher bundle inside a checkout", () => {
    assert.strictEqual(
      resolveMacAppBundlePath(
        "/Users/huy/src/hydrogen/apps/desktop/.electron-runtime/Hydrogen (Dev).app/Contents/MacOS/Electron",
      ),
      "/Users/huy/src/hydrogen/apps/desktop/.electron-runtime/Hydrogen (Dev).app",
    );
  });

  it("finds the outer bundle from a helper app executable", () => {
    assert.strictEqual(
      resolveMacAppBundlePath(
        "/Applications/Hydrogen.app/Contents/Frameworks/Hydrogen Helper.app/Contents/MacOS/Hydrogen Helper",
      ),
      "/Applications/Hydrogen.app",
    );
  });

  it("returns null outside an app bundle", () => {
    assert.isNull(resolveMacAppBundlePath("/usr/local/bin/node"));
  });
});

const recordIn = Effect.fn("DesktopAppLocationTest.recordIn")(function* (input: {
  readonly platform: NodeJS.Platform;
  readonly executablePath: string;
  readonly devServerUrl?: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-desktop-app-location-" });
  const environmentLayer = DesktopEnvironment.layer({
    dirname: "/repo/apps/desktop/src",
    homeDirectory: baseDir,
    platform: input.platform,
    processArch: "arm64",
    appVersion: "0.0.45",
    appPath: "/repo",
    isPackaged: input.devServerUrl === undefined,
    resourcesPath: "/missing/resources",
    runningUnderArm64Translation: false,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        DesktopConfig.layerTest({
          T3CODE_HOME: baseDir,
          VITE_DEV_SERVER_URL: input.devServerUrl,
        }),
      ),
    ),
  );
  return yield* Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    // The app creates its state directory before bootstrap records the location.
    yield* fs.makeDirectory(environment.stateDir, { recursive: true });
    yield* recordDesktopAppLocation();
    const target = environment.path.join(environment.stateDir, DESKTOP_APP_LOCATION_FILE_NAME);
    const entries = yield* fs.readDirectory(environment.stateDir);
    return {
      contents: (yield* fs.exists(target)) ? yield* fs.readFileString(target) : null,
      staged: entries.some((entry) => entry.endsWith(".tmp")),
    };
  }).pipe(
    Effect.provide(environmentLayer),
    Effect.provideService(HostProcess.ExecutablePath, input.executablePath),
  );
});

describe("recordDesktopAppLocation", () => {
  it.effect("records a development bundle as development", () =>
    Effect.gen(function* () {
      const result = yield* recordIn({
        platform: "darwin",
        executablePath:
          "/repo/apps/desktop/.electron-runtime/Hydrogen (Dev).app/Contents/MacOS/Electron",
        devServerUrl: "http://127.0.0.1:5733",
      });
      assert.deepStrictEqual(JSON.parse(result.contents ?? "null"), {
        version: 1,
        appPath: "/repo/apps/desktop/.electron-runtime/Hydrogen (Dev).app",
        development: true,
      });
      assert.isFalse(result.staged);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("records an installed bundle", () =>
    Effect.gen(function* () {
      const result = yield* recordIn({
        platform: "darwin",
        executablePath: "/Applications/Hydrogen.app/Contents/MacOS/Hydrogen",
      });
      assert.deepStrictEqual(JSON.parse(result.contents ?? "null"), {
        version: 1,
        appPath: "/Applications/Hydrogen.app",
        development: false,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("writes nothing off macOS or outside a bundle", () =>
    Effect.gen(function* () {
      const linux = yield* recordIn({
        platform: "linux",
        executablePath: "/opt/Hydrogen/hydrogen",
      });
      assert.isNull(linux.contents);
      const unbundled = yield* recordIn({
        platform: "darwin",
        executablePath: "/usr/local/bin/electron",
      });
      assert.isNull(unbundled.contents);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
