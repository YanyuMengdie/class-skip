/**
 * Match one continuous source span, allowing only runs of whitespace to differ.
 * Always return the original source substring so stored citations keep PDF layout.
 * Words, punctuation, numbers and their order must remain identical.
 */
export function resolveBriefQuote(sourceText: string, quote: string): string | undefined {
  if (!quote.trim()) return undefined;
  if (sourceText.includes(quote)) return quote;
  const wanted = quote.trim().replace(/\s+/g, ' ');
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < sourceText.length;) {
    const start = index;
    if (/\s/.test(sourceText[index])) {
      while (index < sourceText.length && /\s/.test(sourceText[index])) index++;
      characters.push(' ');
    } else {
      characters.push(sourceText[index]);
      index++;
    }
    starts.push(start);
    ends.push(index);
  }
  const offset = characters.join('').indexOf(wanted);
  return offset < 0 ? undefined : sourceText.slice(starts[offset], ends[offset + wanted.length - 1]);
}
