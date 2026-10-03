import { describe, expect, it } from "vite-plus/test";
import { readLexiconPrompt } from "./lexiconPrompt";

function envelope(message: string, context: string, fence = "```", attachments?: string) {
  return (
    `## User message\n\n${fence}text\n${message}\n${fence}\n\n---\n\n## Lexicon execution context\n\n${fence}text\n${context}\n${fence}` +
    (attachments === undefined
      ? ""
      : `\n\n## Runtime attachments\n\n${fence}json\n${attachments}\n${fence}`)
  );
}

describe("Lexicon prompt presentation", () => {
  it("preserves message whitespace, nested fences and every context and attachment character", () => {
    const message = "  Explain **this**\n```ts\nrun()\n```\n ";
    const context = "PROJECT ID: shop\n<evidence>🧭</evidence>\n";
    const attachments = '[\n  {"state":"unavailable","reason":"expired"}\n]';
    expect(readLexiconPrompt(envelope(message, context, "````", attachments))).toEqual({
      message,
      context,
      attachments,
    });
  });

  it("supports historical JSON turns", () => {
    const value = {
      message: "hello",
      context: "instructions",
      runtimeAttachments: [{ extra: "preserve" }],
    };
    expect(
      readLexiconPrompt("Lexicon turn (context and user request):\n" + JSON.stringify(value)),
    ).toEqual({
      message: value.message,
      context: value.context,
      attachments: JSON.stringify(value.runtimeAttachments, null, 2),
    });
  });

  it("leaves ordinary, quoted, truncated and unknown prompt formats untouched", () => {
    const valid = envelope("question", "context");
    for (const text of [
      "hello",
      `Quoted:\n${valid}`,
      valid.slice(0, -1),
      valid + "\n",
      valid + "extra",
      envelope("question", "```"),
      envelope("question", "context", "```", "{}"),
      'Lexicon turn (context and user request):\n{"message":"hi","context":"ctx","extra":"keep"}',
    ]) {
      expect(readLexiconPrompt(text)).toBeNull();
    }
  });
});
