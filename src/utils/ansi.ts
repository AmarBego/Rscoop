// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping intentionally matches ESC (U+001B) and single-char CSI (U+009B) introducers.
const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function stripAnsi(line: string): string {
    ansiRegex.lastIndex = 0;
    return line.replace(ansiRegex, '');
}
