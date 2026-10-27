// What the narrator is given to say (exam-question path only). The sheet's sir_ka_vaakya and the boards keep their
// digits and ₹; only the voice input changes. In a Devanagari line the voice reads digits the Hindi way ("अठारह") and
// "₹" as "RS", so every number is written out in English words, Indian system (lakh, crore), and ₹ becomes "rupees".

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowHundred(n: number) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function belowThousand(n: number) {
  const hundreds = Math.floor(n / 100), rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Whole number in English words, Indian grouping: 120000 -> "one lakh twenty thousand". */
export function indianWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return String(value);
  if (value === 0) return "zero";
  const parts: string[] = [];
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const rest = value % 1000;
  if (crore) parts.push(`${indianWords(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "48,160" -> "forty-eight thousand one hundred sixty"; "105.3" -> "one hundred five point three". */
function numberWords(token: string) {
  const [whole, fraction] = token.replaceAll(",", "").split(".");
  const head = indianWords(Number(whole));
  return fraction ? `${head} point ${[...fraction].map((digit) => ONES[Number(digit)]).join(" ")}` : head;
}

const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;

/** The narrator's input for one line: numbers as English words, ₹ as "rupees", % as "percent", a/b as "a by b". */
export function spokenNarration(text: string) {
  return text
    .replace(new RegExp(`(${NUMBER})\\s*/\\s*(${NUMBER})`, "g"), "$1 by $2")
    .replace(new RegExp(`₹\\s*(${NUMBER})`, "g"), "rupees $1")
    .replaceAll("₹", "rupees ")
    .replace(new RegExp(`[−-](?=\\s?${NUMBER})`, "g"), (match, offset: number, whole: string) => (offset === 0 || /[\s(]/.test(whole[offset - 1]) ? "minus " : match))
    .replace(new RegExp(`(^|[\\s(])\\+(?=\\s?${NUMBER})`, "g"), "$1plus ")
    .replace(new RegExp(`(${NUMBER})\\s*%`, "g"), "$1 percent")
    .replace(/(?<=\d)\s*×\s*(?=\d)/g, " into ")
    .replaceAll("%", " percent")
    .replace(/\s=\s/g, " equals ")
    // A number glued to letters ("13a", "9C3") is spoken as separate words.
    .replace(new RegExp(NUMBER, "g"), (match, offset: number, whole: string) => {
      const before = whole[offset - 1] ?? " ", after = whole[offset + match.length] ?? " ";
      const trailingComma = match.endsWith(",") ? "," : "";
      const words = numberWords(trailingComma ? match.slice(0, -1) : match);
      return `${/[\p{L}]/u.test(before) ? " " : ""}${words}${trailingComma}${/[\p{L}]/u.test(after) ? " " : ""}`;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
