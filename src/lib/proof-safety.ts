const proofSignals = [
  { label: "clinical evidence", pattern: /\bclinical(?:ly)?\b/i, source: /\bclinical(?:ly)?\b/i },
  { label: "medical endorsement", pattern: /\b(?:dermatologists?|doctors?|physicians?|medical experts?|expert[- ](?:backed|approved|recommended))\b/i, source: /\b(?:dermatologists?|doctors?|physicians?|medical experts?|expert)\b/i },
  { label: "testing or research", pattern: /\b(?:consumer[- ]?trial|clinical trial|trial data|research[- ]backed|study shows|studies show|lab[- ]tested|tested and proven)\b/i, source: /\b(?:trial|research|study|lab[- ]tested|tested and proven)\b/i },
  { label: "certification or approval", pattern: /\b(?:certified|approved by|certification|official seal|quality seal)\b/i, source: /\b(?:certified|approved by|certification|seal)\b/i },
  { label: "testimonial or social proof", pattern: /\b(?:testimonial|customer review|user review|five[- ]star|5[- ]star|real users? (?:say|report|prove)|peer[- ]to[- ]peer social proof)\b/i, source: /\b(?:testimonial|review|five[- ]star|5[- ]star|real users?|peer[- ]to[- ]peer)\b/i },
  { label: "award", pattern: /\b(?:award[- ]winning|winner of|industry award)\b/i, source: /\b(?:award[- ]winning|winner of|industry award)\b/i },
  { label: "guaranteed or immediate result", pattern: /\b(?:guaranteed results?|instant results?|immediate visible (?:result|improvement|glow)|works instantly)\b/i, source: /\b(?:guaranteed|instant|immediate)\b/i },
] as const;

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenStrings);
  return [];
}

export function findUnsupportedProof(value: unknown, suppliedSource: string) {
  const output = flattenStrings(value).join("\n");
  const issues: string[] = proofSignals
    .filter(({ pattern, source }) => pattern.test(output) && !source.test(suppliedSource))
    .map(({ label }) => label);

  const suppliedNumbers = new Set(suppliedSource.match(/\b\d+(?:\.\d+)?%/g) ?? []);
  const unsupportedNumbers = (output.match(/\b\d+(?:\.\d+)?%/g) ?? []).filter((value) => !suppliedNumbers.has(value));
  if (unsupportedNumbers.length) issues.push("unsupported percentage or performance number");
  return [...new Set(issues)];
}

export const proofSafetyInstruction = `PROOF SAFETY — NON-NEGOTIABLE
- Never invent claims, certifications, medical or clinical proof, trials, studies, testimonials, reviews, expert endorsements, awards, performance numbers, seals, or social proof.
- Use one of those only when it appears explicitly in the supplied user brief.
- When supplied proof is absent, use observable product behaviour, a neutral demonstration, material or craft detail, or clearly framed emotional storytelling.
- Do not turn a desired outcome into evidence that it has already happened.`;
