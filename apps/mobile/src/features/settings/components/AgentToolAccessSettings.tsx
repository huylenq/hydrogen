import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ServerConfig, ServerSettingsPatch } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../../components/AppText";
import { ThemedSwitch } from "../../../components/ThemedSwitch";
import { useEnvironments } from "../../../state/environments";
import { serverEnvironment } from "../../../state/server";
import { useAtomCommand } from "../../../state/use-atom-command";
import { SettingsSection } from "./SettingsSection";

export function AgentToolAccessSettings() {
  const { environments } = useEnvironments();
  const configured = environments.filter((environment) => environment.serverConfig !== null);
  if (configured.length === 0) return null;

  return (
    <View className="mt-6 gap-3">
      <Text className="px-2 text-sm font-t3-medium text-foreground-muted">Agent tools</Text>
      <Text className="px-2 text-sm text-foreground-muted">
        Set access separately for each environment. Changes apply to agent sessions started after
        the change.
      </Text>
      {configured.map((environment) => (
        <EnvironmentAgentToolSettings
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={environment.label}
          connected={environment.connection.phase === "connected"}
          config={environment.serverConfig!}
        />
      ))}
    </View>
  );
}

function EnvironmentAgentToolSettings(props: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connected: boolean;
  readonly config: ServerConfig;
}) {
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  async function update(patch: ServerSettingsPatch) {
    if (saving.current || !props.connected) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await updateSettings({ environmentId: props.environmentId, input: { patch } });
      if (result._tag === "Failure") {
        const failure = squashAtomCommandFailure(result);
        setError(failure instanceof Error ? failure.message : "Could not save agent access.");
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <SettingsSection title={props.label}>
      <View className="flex-row items-center gap-3 p-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-t3-medium">Agent browser access</Text>
          <Text className="text-sm text-foreground-muted">
            Manual browser controls stay available.
          </Text>
        </View>
        <ThemedSwitch
          accessibilityLabel={`Allow agent browser access on ${props.label}`}
          value={props.config.settings.enableAgentBrowserAccess}
          disabled={!props.connected || busy}
          onValueChange={(value) => void update({ enableAgentBrowserAccess: value })}
        />
      </View>
      {busy || !props.connected || error ? (
        <Text
          accessibilityRole={error ? "alert" : undefined}
          className="px-4 pb-3 text-sm text-foreground-muted"
        >
          {error ?? (busy ? "Saving…" : "Reconnect this environment to change agent access.")}
        </Text>
      ) : null}
    </SettingsSection>
  );
}
