import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

/** Lexicon uses this file beside the control socket to find the installed bundle. Development bundles require their dev runner, so readers must distinguish them before launching. */
export const DESKTOP_APP_LOCATION_FILE_NAME = "desktop-app.json";

const DesktopAppLocation = Schema.Struct({
  version: Schema.Literal(1),
  appPath: Schema.String,
  development: Schema.Boolean,
});
const encodeDesktopAppLocation = Schema.encodeSync(Schema.fromJsonString(DesktopAppLocation));

/** The `.app` bundle that contains a macOS executable, or null outside one. */
export function resolveMacAppBundlePath(executablePath: string): string | null {
  const marker = ".app/Contents/";
  const index = executablePath.indexOf(marker);
  return index === -1 ? null : executablePath.slice(0, index + ".app".length);
}

export const recordDesktopAppLocation = Effect.fn("desktop.appLocation.record")(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (environment.platform !== "darwin") return;
  const appPath = resolveMacAppBundlePath(yield* HostProcess.ExecutablePath);
  if (appPath === null) return;
  const fs = yield* FileSystem.FileSystem;
  const target = environment.path.join(environment.stateDir, DESKTOP_APP_LOCATION_FILE_NAME);
  const staging = `${target}.tmp`;
  // Readers may poll while the app starts, so replace the file in one step.
  yield* fs.writeFileString(
    staging,
    `${encodeDesktopAppLocation({ version: 1, appPath, development: environment.isDevelopment })}\n`,
  );
  yield* fs.rename(staging, target);
});
