import type { GenerationType, QuestionOption, QuestionSolve, QuestionSource } from "@/lib/types";

const options: QuestionOption[] = ["A", "B", "C", "D"];

export class QuestionValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

function requiredText(value: unknown, field: string) {
  const text = String(value ?? "");
  if (!text.trim()) throw new QuestionValidationError(field, "must not be empty.");
  return text;
}

function requiredOption(value: unknown, field: string): QuestionOption {
  const option = String(value ?? "").trim().toUpperCase();
  if (!options.includes(option as QuestionOption)) throw new QuestionValidationError(field, "must be one of A, B, C, or D.");
  return option as QuestionOption;
}

export function generationType(value: unknown): GenerationType {
  return value === "question" ? "question" : "ad";
}

export function validateQuestionSource(value: unknown): QuestionSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QuestionValidationError("source", "is required for a question generation.");
  const source = value as Record<string, unknown>;
  const fileName = requiredText(source.fileName, "source.fileName");
  const slideNumber = Number(source.slideNumber);
  if (!Number.isInteger(slideNumber) || slideNumber < 1) throw new QuestionValidationError("source.slideNumber", "must be a positive integer.");
  const question = requiredText(source.question, "source.question");
  if (!source.options || typeof source.options !== "object" || Array.isArray(source.options)) throw new QuestionValidationError("source.options", "must contain A, B, C, and D.");
  const suppliedOptions = source.options as Record<string, unknown>;
  const sourceOptions = Object.fromEntries(options.map((option) => [option, requiredText(suppliedOptions[option], `source.options.${option}`)])) as Record<QuestionOption, string>;
  const commonWrongText = String(source.commonWrong ?? "").trim().toUpperCase();
  const commonWrong = commonWrongText ? requiredOption(commonWrongText, "source.commonWrong") : "";
  const trap = String(source.trap ?? "");
  return { fileName, slideNumber, question, options: sourceOptions, commonWrong, trap };
}

export function assertSolveMatchesSource(value: unknown, source: QuestionSource) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QuestionValidationError("solve", "is required for a question generation.");
  const solve = value as Record<string, unknown>;
  if (solve.question !== source.question) throw new QuestionValidationError("solve.question", "must match source.question verbatim.");
  if (!solve.options || typeof solve.options !== "object" || Array.isArray(solve.options)) throw new QuestionValidationError("solve.options", "must match source.options verbatim.");
  const suppliedOptions = solve.options as Record<string, unknown>;
  for (const option of options) {
    if (suppliedOptions[option] !== source.options[option]) throw new QuestionValidationError(`solve.options.${option}`, `must match source.options.${option} verbatim.`);
  }
  if (String(solve.commonWrong ?? "").trim().toUpperCase() !== source.commonWrong) throw new QuestionValidationError("solve.commonWrong", "must match the common mistake identified by the source deck.");
  if (String(solve.trap ?? "") !== source.trap) throw new QuestionValidationError("solve.trap", "must match the trap identified by the source deck verbatim.");
}

export function validateQuestionSolve(type: unknown, value: unknown): QuestionSolve | undefined {
  if (generationType(type) !== "question") return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QuestionValidationError("solve", "is required for a question generation.");
  const solve = value as Record<string, unknown>;
  const question = requiredText(solve.question, "solve.question");
  if (!solve.options || typeof solve.options !== "object" || Array.isArray(solve.options)) throw new QuestionValidationError("solve.options", "must contain A, B, C, and D.");
  const suppliedOptions = solve.options as Record<string, unknown>;
  const parsedOptions = Object.fromEntries(options.map((option) => [option, requiredText(suppliedOptions[option], `solve.options.${option}`)])) as Record<QuestionOption, string>;
  const correct = requiredOption(solve.correct, "solve.correct");
  const commonWrong = requiredOption(solve.commonWrong, "solve.commonWrong");
  if (commonWrong === correct) throw new QuestionValidationError("solve.commonWrong", "must not equal solve.correct.");
  const trap = requiredText(solve.trap, "solve.trap");
  const rule = requiredText(solve.rule, "solve.rule");
  const ruleWords = rule.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (ruleWords > 15) throw new QuestionValidationError("solve.rule", `must be 15 words or fewer; received ${ruleWords}.`);
  const answerLine = requiredText(solve.answerLine, "solve.answerLine");
  if (!new RegExp(`\\banswer\\s+is\\s+${correct}\\b`, "i").test(answerLine)) {
    throw new QuestionValidationError("solve.answerLine", `must name the correct option ${correct} as "The answer is ${correct}".`);
  }
  if (!Array.isArray(solve.eliminations)) throw new QuestionValidationError("solve.eliminations", "must be an array.");
  const eliminations = solve.eliminations.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new QuestionValidationError(`solve.eliminations[${index}]`, "must contain option and reason.");
    const item = entry as Record<string, unknown>;
    return { option: requiredOption(item.option, `solve.eliminations[${index}].option`), reason: requiredText(item.reason, `solve.eliminations[${index}].reason`) };
  });
  const wrongOptions = options.filter((option) => option !== correct);
  for (const option of wrongOptions) {
    if (!eliminations.some((item) => item.option === option)) throw new QuestionValidationError("solve.eliminations", `missing elimination for wrong option ${option}.`);
  }
  if (eliminations.some((item) => item.option === correct)) throw new QuestionValidationError("solve.eliminations", `must not eliminate the correct option ${correct}.`);
  if (new Set(eliminations.map((item) => item.option)).size !== eliminations.length) throw new QuestionValidationError("solve.eliminations", "must not repeat an option.");
  return { question, options: parsedOptions, correct, commonWrong, trap, eliminations, rule, answerLine };
}

export function buildQuestionNarration(solve: QuestionSolve) {
  const eliminations = solve.eliminations.map(({ option, reason }) => `Option ${option} is out because ${reason.replace(/[.!?]+$/, "")}.`).join(" ");
  return `Here is the clue: ${solve.trap.replace(/[.!?]+$/, "")}. The governing rule is: ${solve.rule.replace(/[.!?]+$/, "")}. ${eliminations} ${solve.answerLine}`;
}
