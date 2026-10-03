/* Evidence rows are controlled and positional; keep their keys stable while labels and text are edited. */
/* oxlint-disable react/no-array-index-key */
import type { CrewContextSource, CrewDraftContext } from "@t3tools/client-runtime/crew-draft";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ControlPill } from "../../components/ControlPill";

export function CrewContextEditor({
  context,
  sources,
  onChange,
  onClose,
}: {
  context: CrewDraftContext;
  sources: ReadonlyArray<CrewContextSource>;
  onChange: (context: CrewDraftContext) => void;
  onClose: () => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const evidence = context.evidence ?? [];
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-sheet pt-4"
      >
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Text className="text-lg font-t3-bold">Task context</Text>
          <ControlPill label="Done" variant="primary" onPress={onClose} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        >
          <Text className="text-xs leading-normal text-foreground-muted">
            Choose what the bot needs. Full history and file contents are not included
            automatically.
          </Text>
          {(
            [
              ["goal", "Task goal", "What are we trying to achieve?"],
              ["currentState", "Current state", "What is implemented, failing, or undecided?"],
              [
                "expectedResult",
                "Expected result",
                "For example: the three most important findings",
              ],
            ] as const
          ).map(([field, label, placeholder]) => (
            <View key={field} className="gap-2">
              <Text className="text-xs font-t3-medium text-foreground-muted">{label}</Text>
              <TextInput
                accessibilityLabel={label}
                placeholder={placeholder}
                multiline
                maxLength={16000}
                value={context[field] ?? ""}
                onChangeText={(value) => onChange({ ...context, [field]: value })}
                className="min-h-20 rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </View>
          ))}
          <View className="gap-2">
            <Text className="text-xs font-t3-medium text-foreground-muted">
              Constraints (one per line)
            </Text>
            <TextInput
              accessibilityLabel="Constraints"
              multiline
              maxLength={16000}
              value={context.constraints?.join("\n") ?? ""}
              onChangeText={(value) => onChange({ ...context, constraints: value.split("\n") })}
              className="min-h-20 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
          </View>
          {sources.length ? (
            <ControlPill
              variant="pill"
              label={showSources ? "Hide task excerpts" : "Choose task excerpts"}
              onPress={() => setShowSources(!showSources)}
            />
          ) : null}
          {showSources
            ? sources.map((source) => (
                <View key={source.id} className="gap-2 rounded-xl border border-border bg-card p-3">
                  <Text className="text-xs text-foreground-muted">{source.label}</Text>
                  <Text numberOfLines={4} className="text-sm">
                    {source.text}
                  </Text>
                  <ControlPill
                    variant="pill"
                    label="Add excerpt"
                    disabled={
                      evidence.length >= 20 ||
                      evidence.some(
                        (item) => item.label === source.label && item.text === source.text,
                      )
                    }
                    onPress={() =>
                      onChange({
                        ...context,
                        evidence: [...evidence, { label: source.label, text: source.text }],
                      })
                    }
                  />
                </View>
              ))
            : null}
          {evidence.map((item, index) => (
            <View key={index} className="gap-2 rounded-xl border border-border bg-card p-3">
              <TextInput
                accessibilityLabel={`Evidence ${index + 1} label`}
                maxLength={256}
                value={item.label}
                className="text-xs font-t3-medium"
                onChangeText={(value) =>
                  onChange({
                    ...context,
                    evidence: evidence.map((entry, position) =>
                      position === index ? { ...entry, label: value } : entry,
                    ),
                  })
                }
              />
              <TextInput
                accessibilityLabel={`Evidence ${index + 1} text`}
                multiline
                maxLength={16000}
                value={item.text}
                className="max-h-52 min-h-20 text-sm"
                onChangeText={(value) =>
                  onChange({
                    ...context,
                    evidence: evidence.map((entry, position) =>
                      position === index ? { ...entry, text: value } : entry,
                    ),
                  })
                }
              />
              <ControlPill
                variant="pill"
                label="Remove excerpt"
                onPress={() =>
                  onChange({
                    ...context,
                    evidence: evidence.filter((_, position) => position !== index),
                  })
                }
              />
            </View>
          ))}
          <ControlPill
            variant="pill"
            label="Paste code, a diff, or logs"
            disabled={evidence.length >= 20}
            onPress={() =>
              onChange({
                ...context,
                evidence: [...evidence, { label: "Selected evidence", text: "" }],
              })
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
