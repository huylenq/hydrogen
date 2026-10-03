export interface LexiconPrompt {
  message: string;
  context: string;
  attachments?: string;
}

/** Presentation only. The stored prompt remains the complete provider input. */
export function readLexiconPrompt(text: string): LexiconPrompt | null {
  const legacyPrefix = "Lexicon turn (context and user request):\n";
  if (text.startsWith(legacyPrefix)) {
    try {
      const value: unknown = JSON.parse(text.slice(legacyPrefix.length));
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const record = value as Record<string, unknown>;
      if (
        typeof record.message !== "string" ||
        typeof record.context !== "string" ||
        Object.keys(record).some(
          (key) => !["message", "context", "runtimeAttachments"].includes(key),
        ) ||
        (record.runtimeAttachments !== undefined && !Array.isArray(record.runtimeAttachments))
      )
        return null;
      return {
        message: record.message,
        context: record.context,
        ...(record.runtimeAttachments !== undefined
          ? { attachments: JSON.stringify(record.runtimeAttachments, null, 2) }
          : {}),
      };
    } catch {
      return null;
    }
  }
  if (!text.startsWith("## User message\n\n")) return null;
  const match =
    /^## User message\n\n(`{3,})text\n([\s\S]*?)\n\1\n\n---\n\n## Lexicon execution context\n\n\1text\n([\s\S]*?)\n\1(?:\n\n## Runtime attachments\n\n\1json\n([\s\S]*?)\n\1)?$/.exec(
      text,
    );
  if (!match || match[0] !== text) return null;
  const [, fence, message, context, attachments] = match;
  if (
    !fence ||
    message === undefined ||
    context === undefined ||
    [message, context, attachments ?? ""].some((part) => part.includes(fence))
  )
    return null;
  if (attachments !== undefined) {
    try {
      if (!Array.isArray(JSON.parse(attachments))) return null;
    } catch {
      return null;
    }
  }
  return { message, context, ...(attachments !== undefined ? { attachments } : {}) };
}
