export const tools = Object.freeze([]);

export function assertTextOnlyOutput(output) {
  if (!Array.isArray(output) || !output.length) throw new Error("EMPTY_RESPONSE");
  for (const item of output) {
    if (item.type === "reasoning") continue;
    if (item.type !== "message" || item.role !== "assistant" || item.status !== "completed")
      throw new Error("UNEXPECTED_OUTPUT");
    if (!Array.isArray(item.content) || !item.content.length) throw new Error("EMPTY_RESPONSE");
    for (const content of item.content) {
      if (content.type === "refusal") throw new Error("REFUSED_RESPONSE");
      if (content.type !== "output_text" || typeof content.text !== "string") throw new Error("UNEXPECTED_OUTPUT");
    }
  }
}
