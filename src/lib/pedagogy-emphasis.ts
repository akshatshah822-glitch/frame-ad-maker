/**
 * Topic (concept) and diagram slides can highlight several key points at once:
 * the emphasis column holds phrases separated by "|", e.g. "IPC | IPU | Mihir Shah Committee".
 * A single phrase without "|" works exactly as before.
 */
export function emphasisPhrases(emphasis: string) {
  return emphasis.split("|").map((phrase) => phrase.trim()).filter(Boolean);
}
