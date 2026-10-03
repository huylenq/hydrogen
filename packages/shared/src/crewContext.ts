import type { CrewTaskContext } from "@t3tools/contracts";

export const CREW_MESSAGE_MAX_LENGTH = 32000;
export const CREW_DEFAULT_CONTEXT_TOKEN_BUDGET = 2000;

/** A size estimate only; Grok Bot's own context and processing are separate. */
export const estimateCrewTokens = (text: string): number => Math.ceil(text.length / 4);

export function formatCrewMessage(input: {
  text: string;
  context?: CrewTaskContext | undefined;
  replyMarker?: string | undefined;
}): string {
  const context = input.context;
  const sections = [input.text];
  if (context?.goal?.trim()) sections.push(`Task goal:\n${context.goal}`);
  if (context?.currentState?.trim()) sections.push(`Current state:\n${context.currentState}`);
  if (context?.constraints?.length)
    sections.push(`Constraints:\n${context.constraints.map((item) => `- ${item}`).join("\n")}`);
  for (const evidence of context?.evidence ?? [])
    sections.push(`Evidence — ${evidence.label}:\n${evidence.text}`);
  if (context?.expectedResult?.trim()) sections.push(`Expected result:\n${context.expectedResult}`);
  if (input.replyMarker)
    sections.push(
      `T3 reply routing: When your answer to this request is ready, include the exact marker ${input.replyMarker} once at the end of your final text reply. Keep intermediate updates unmarked. The marker only routes your response to its originating task; it does not certify completion.`,
    );
  return sections.join("\n\n");
}

export function validateCrewMessage(
  text: string,
  tokenBudget = CREW_DEFAULT_CONTEXT_TOKEN_BUDGET,
): string | null {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 256 || tokenBudget > 4000)
    return "Choose a context budget between 256 and 4,000 estimated tokens.";
  if (!text.trim()) return "Write a question for the bot.";
  if (text.length > CREW_MESSAGE_MAX_LENGTH)
    return "The complete message exceeds 32,000 characters. Remove some context before sending.";
  if (estimateCrewTokens(text) > tokenBudget)
    return `The complete message exceeds the ${tokenBudget.toLocaleString("en-US")} estimated-token budget. Remove some context or increase the budget before sending.`;
  return null;
}
