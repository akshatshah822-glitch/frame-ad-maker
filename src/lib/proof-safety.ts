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

const neutralProofReplacements: Array<{ pattern: RegExp; replacement: string; source: RegExp }> = [
  { pattern: /\bclinical(?:ly)?\b/gi, replacement: "visually observable", source: /\bclinical(?:ly)?\b/i },
  { pattern: /\b(?:dermatologists?|doctors?|physicians?|medical experts?|expert[- ](?:backed|approved|recommended))\b/gi, replacement: "the product demonstration", source: /\b(?:dermatologists?|doctors?|physicians?|medical experts?|expert)\b/i },
  { pattern: /\b(?:consumer[- ]?trial|clinical trial|trial data|research[- ]backed|study shows|studies show|lab[- ]tested|tested and proven)\b/gi, replacement: "an observable product demonstration", source: /\b(?:trial|research|study|lab[- ]tested|tested and proven)\b/i },
  { pattern: /\b(?:certified|approved by|certification|official seal|quality seal)\b/gi, replacement: "clearly demonstrated", source: /\b(?:certified|approved by|certification|seal)\b/i },
  { pattern: /\b(?:testimonial|customer review|user review|five[- ]star|5[- ]star|real users? (?:say|report|prove)|peer[- ]to[- ]peer social proof)\b/gi, replacement: "an everyday product-use moment", source: /\b(?:testimonial|review|five[- ]star|5[- ]star|real users?|peer[- ]to[- ]peer)\b/i },
  { pattern: /\b(?:award[- ]winning|winner of|industry award)\b/gi, replacement: "distinctive", source: /\b(?:award[- ]winning|winner of|industry award)\b/i },
  { pattern: /\b(?:guaranteed results?|instant results?|immediate visible (?:result|improvement|glow)|works instantly)\b/gi, replacement: "an observable application moment", source: /\b(?:guaranteed|instant|immediate)\b/i },
];

export function neutralizeUnsupportedProof<T>(value: T, suppliedSource: string): T {
  if (typeof value === "string") {
    let safe: string = value;
    for (const item of neutralProofReplacements) {
      if (!item.source.test(suppliedSource)) safe = safe.replace(item.pattern, item.replacement);
    }
    const suppliedNumbers = new Set(suppliedSource.match(/\b\d+(?:\.\d+)?%/g) ?? []);
    safe = safe.replace(/\b\d+(?:\.\d+)?%/g, (number) => suppliedNumbers.has(number) ? number : "a clearly observable amount");
    return safe as T;
  }
  if (Array.isArray(value)) return value.map((item) => neutralizeUnsupportedProof(item, suppliedSource)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, neutralizeUnsupportedProof(item, suppliedSource)])) as T;
  }
  return value;
}

export const proofSafetyInstruction = `PROOF SAFETY — NON-NEGOTIABLE
- Never invent claims, certifications, medical or clinical proof, trials, studies, testimonials, reviews, expert endorsements, awards, performance numbers, seals, or social proof.
- Use one of those only when it appears explicitly in the supplied user brief.
- When supplied proof is absent, use observable product behaviour, a neutral demonstration, material or craft detail, or clearly framed emotional storytelling.
- Do not turn a desired outcome into evidence that it has already happened.`;
