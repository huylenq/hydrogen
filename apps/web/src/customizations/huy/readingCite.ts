import {
  ASSISTANT_CITATION_MAX_TEXT_LENGTH,
  EnvironmentId,
  MessageId,
  ThreadId,
  type AssistantCitation,
} from "@t3tools/contracts";
import {
  assistantTextRange,
  captureAssistantTextRange,
  type AssistantCitationSourceAnchor,
} from "../../lib/assistantTextSelection";

/**
 * Vim `c` cites the block being read, as if its text were selected and cited with the mouse.
 * Code blocks cite their code without the language header.
 */
export function captureBlockCitation(
  block: HTMLElement,
): { citation: AssistantCitation; anchor: AssistantCitationSourceAnchor } | { reason: string } {
  const source = block.closest<HTMLElement>("[data-assistant-citation-source]");
  const viewport = block.closest<HTMLElement>("[data-assistant-citation-viewport]");
  const messageId = source?.dataset.assistantCitationSource;
  const environmentId = source?.dataset.assistantCitationEnvironment;
  const threadId = source?.dataset.assistantCitationThread;
  if (!source || !viewport || !messageId || !environmentId || !threadId)
    return { reason: "Only answer text can be cited" };
  const code = block.matches("[data-language]") ? block.querySelector<HTMLElement>("pre") : null;
  const range = assistantTextRange(code ?? block);
  const captured = range ? captureAssistantTextRange(viewport, range) : null;
  if (!captured) return { reason: "This block has no text to cite" };
  if (captured.selector.text.length > ASSISTANT_CITATION_MAX_TEXT_LENGTH)
    return { reason: "This block is too long to cite; select part of it instead" };
  return {
    citation: {
      version: 1,
      environmentId: EnvironmentId.make(environmentId),
      threadId: ThreadId.make(threadId),
      messageId: MessageId.make(messageId),
      ...captured.selector,
    },
    anchor: { source: captured.source, range: captured.range, viewport },
  };
}
