const vagueCameraDirection = /\b(?:a clearly observable amount|slow(?:ly)?|subtle(?:ly)?|gentle(?:ly)?|slight(?:ly)?|gradual(?:ly)?|steady|restrained|minimal(?:ly)?|micro|noticeable(?:ly)?)\b/i;
const cameraAmount = /\b\d+(?:\.\d+)?\s*(?:%|degrees?|°|mm|cm|m)(?=\s|$)/i;
const cameraDuration = /\b(?:over|for|within)\s+\d+(?:\.\d+)?\s*(?:seconds?|secs?|s)\b/i;

export function cameraDirectionError(value: string) {
  const direction = value.trim();
  if (vagueCameraDirection.test(direction)) return `contains vague phrasing: ${direction}`;
  if (!cameraAmount.test(direction)) return `has no measurable amount: ${direction}`;
  if (!cameraDuration.test(direction)) return `has no numeric duration: ${direction}`;
  return "";
}
