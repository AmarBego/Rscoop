export async function writeClipboardText(text: string): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard;

  if (typeof clipboard?.writeText !== "function") {
    throw new Error("Clipboard API is unavailable in this context.");
  }

  await clipboard.writeText(text);
}
