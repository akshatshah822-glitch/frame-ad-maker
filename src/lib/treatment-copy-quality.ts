import type { Concept, Generation } from "@/lib/types";

export type DuplicateWordIssue = {
  field: string;
  word: string;
  value: string;
};

const connectingWords = new Set(["and", "but", "or", "then", "with", "yet"]);

function duplicateInText(field: string, value: string): DuplicateWordIssue | null {
  const words = value.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [];
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1]) return { field, word: words[index], value };
    if (index > 1 && connectingWords.has(words[index - 1]) && words[index] === words[index - 2]) {
      return { field, word: words[index], value };
    }
  }
  return null;
}

function firstIssue(fields: Array<[string, string | undefined]>): DuplicateWordIssue | null {
  for (const [field, value] of fields) {
    if (!value?.trim()) continue;
    const issue = duplicateInText(field, value);
    if (issue) return issue;
  }
  return null;
}

export function findDuplicateWordIssue(generation: Generation, concept?: Concept): DuplicateWordIssue | null {
  if (concept) {
    const conceptIssue = firstIssue([
      ["concept.conceptName", concept.conceptName],
      ["concept.idea", concept.idea],
      ["concept.hook", concept.hook],
      ["concept.story", concept.story],
      ["concept.productRole", concept.productRole],
      ["concept.visualWorld", concept.visualWorld],
      ["concept.ending", concept.ending],
      ["concept.logline", concept.logline],
      ["concept.humanTruth", concept.humanTruth],
      ["concept.centralConflict", concept.centralConflict],
      ["concept.emotionalArc", concept.emotionalArc],
      ["concept.coreMessage", concept.coreMessage],
    ]);
    if (conceptIssue) return conceptIssue;
  }
  const topLevel: Array<[string, string | undefined]> = [
    ["title", generation.title],
    ["visualBible.subject", generation.visualBible.subject],
    ["visualBible.product", generation.visualBible.product],
    ["visualBible.location", generation.visualBible.location],
    ["visualBible.lighting", generation.visualBible.lighting],
    ["visualBible.cinematography", generation.visualBible.cinematography],
    ["visualBible.texture", generation.visualBible.texture],
    ...generation.visualBible.continuityLocks.map((value, index) => [`visualBible.continuityLocks[${index}]`, value] as [string, string]),
  ];
  const topLevelIssue = firstIssue(topLevel);
  if (topLevelIssue) return topLevelIssue;

  for (const shot of generation.shots) {
    const prefix = `shots[${shot.shotNumber}]`;
    const issue = firstIssue([
      [`${prefix}.narrativeBeat`, shot.narrativeBeat],
      [`${prefix}.purpose`, shot.purpose],
      [`${prefix}.displayVisual`, shot.displayVisual],
      [`${prefix}.displayAction`, shot.displayAction],
      [`${prefix}.visualDescription`, shot.visualDescription],
      [`${prefix}.subjectAction`, shot.subjectAction],
      [`${prefix}.productAction`, shot.productAction],
      [`${prefix}.performanceDirection`, shot.performanceDirection],
      [`${prefix}.audioIntent`, shot.audioIntent],
      [`${prefix}.voiceoverOrDialogue`, shot.voiceoverOrDialogue],
      [`${prefix}.copyOrDialogue`, shot.copyOrDialogue],
      [`${prefix}.productPresence`, shot.productPresence],
      [`${prefix}.locationAndProps`, shot.locationAndProps],
      [`${prefix}.transitionIntent`, shot.transitionIntent],
    ]);
    if (issue) return issue;
  }
  return null;
}
