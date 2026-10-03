// @effect-diagnostics nodeBuiltinImport:off - atomic durability needs file and directory fsync, unavailable in the FileSystem abstraction.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { CrewError, CrewHandoff } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const Ledger = Schema.Struct({
  version: Schema.Literal(1),
  handoffs: Schema.Array(CrewHandoff),
  connection: Schema.optional(
    Schema.Struct({ accountScope: Schema.NullOr(Schema.String), enabled: Schema.Boolean }),
  ),
});

const decodeLedger = Schema.decodeUnknownSync(Schema.fromJsonString(Ledger));

export interface CrewStore {
  load(): Promise<readonly CrewHandoff[]>;
  save(handoffs: readonly CrewHandoff[]): Promise<void>;
  loadConnection?(): Promise<{ accountScope: string | null; enabled: boolean } | undefined>;
  saveConnection?(connection: { accountScope: string | null; enabled: boolean }): Promise<void>;
}

/** Atomic replacement is called under the controller's single mutation queue. */
export function fileCrewStore(path: string): CrewStore {
  let current: readonly CrewHandoff[] = [];
  let connection: { accountScope: string | null; enabled: boolean } | undefined;
  const store: CrewStore = {
    async load() {
      try {
        const ledger = decodeLedger(await NodeFSP.readFile(path, "utf8"));
        current = ledger.handoffs;
        connection = ledger.connection;
        return current;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
        throw new CrewError({
          code: "storage",
          message: "Could not read the Grok Bot handoff ledger.",
        });
      }
    },
    async save(handoffs) {
      try {
        await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true, mode: 0o700 });
        const temporary = `${path}.tmp`;
        const file = await NodeFSP.open(temporary, "w", 0o600);
        try {
          await file.writeFile(JSON.stringify({ version: 1, handoffs, connection }));
          await file.sync();
        } finally {
          await file.close();
        }
        await NodeFSP.rename(temporary, path);
        const directory = await NodeFSP.open(NodePath.dirname(path), "r");
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
        current = handoffs;
      } catch {
        throw new CrewError({
          code: "storage",
          message:
            "Could not save the Grok Bot handoff ledger. No send will be retried automatically.",
        });
      }
    },
    loadConnection: async () => connection,
    async saveConnection(next) {
      const previous = connection;
      connection = next;
      try {
        await store.save(current);
      } catch (error) {
        connection = previous;
        throw error;
      }
    },
  };
  return store;
}
