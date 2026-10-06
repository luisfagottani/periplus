/** In-memory stream that records everything written to it. */
export interface MemoryStream {
  isTTY: boolean;
  write: (chunk: string) => boolean;
  /** Everything written so far. */
  text: () => string;
}

/** Creates a {@link MemoryStream}; `isTTY` mimics an interactive terminal. */
export function memoryStream(isTTY = false): MemoryStream {
  const chunks: string[] = [];
  return {
    isTTY,
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
    text: () => chunks.join(""),
  };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape codes is the point.
const ANSI = /\u001b\[[0-9;]*m/;

/** Whether `text` contains ANSI style codes. */
export function hasAnsi(text: string): boolean {
  return ANSI.test(text);
}
