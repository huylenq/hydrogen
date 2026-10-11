import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

/**
 * Hydrogen fork (HYDROGEN-SPECS.md, "Desktop app location"). Local tools such
 * as Lexicon find the running app through the control socket derived from the
 * state directory; this file beside it tells them which bundle to open when
 * the socket is down, wherever the app was built or installed. A development
 * bundle only works while its dev runner serves the renderer, so the file says
 * which kind it is and readers can ask for the runner instead of opening it.
 */
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
