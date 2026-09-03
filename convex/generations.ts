import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const questionOption = v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D"));
const questionSolve = v.object({
  question: v.string(),
  options: v.object({ A: v.string(), B: v.string(), C: v.string(), D: v.string() }),
  correct: questionOption,
  commonWrong: questionOption,
  trap: v.string(),
  eliminations: v.array(v.object({ option: questionOption, reason: v.string() })),
  rule: v.string(),
  answerLine: v.string(),
});

export const save = mutation({
  args: { intent: v.optional(v.string()), testObjective: v.optional(v.string()), testObjectiveOther: v.optional(v.string()), preserveDetails: v.optional(v.string()), brandProduct: v.string(), audience: v.string(), proposition: v.string(), platform: v.string(), visualTones: v.array(v.string()), selectedConcept: v.string(), brandBible: v.optional(v.string()), creativeGrammar: v.optional(v.string()), visualBible: v.string(), title: v.string(), script: v.optional(v.string()), shotList: v.string() },
  handler: async (ctx, args) => ctx.db.insert("generations", { ...args, createdAt: Date.now() }),
});

export const saveQuestion = mutation({
  args: { title: v.string(), solve: questionSolve, script: v.string(), sourceFileName: v.string(), sourceSlideNumber: v.number() },
  handler: async (ctx, { title, solve, script, sourceFileName, sourceSlideNumber }) => ctx.db.insert("generations", {
    type: "question",
    title,
    solve,
    script,
    sourceFileName,
    sourceSlideNumber,
    shotList: "[]",
    createdAt: Date.now(),
  }),
});

export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});

export const getById = query({
  args: { id: v.id("generations") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const saveScript = mutation({
  args: { generationId: v.id("generations"), script: v.string() },
  handler: async (ctx, { generationId, script }) => {
    const generation = await ctx.db.get(generationId);
    if (!generation) return false;
    const savedScript = script.trim();
    if (!savedScript) throw new Error("A voiceover script is required.");
    await ctx.db.patch(generationId, { script: savedScript });
    return true;
  },
});

export const repairPublishedTreatment = mutation({
  args: {
    generationId: v.id("generations"),
    selectedConcept: v.string(),
    visualBible: v.string(),
    shotList: v.string(),
  },
  handler: async (ctx, { generationId, selectedConcept, visualBible, shotList }) => {
    const generation = await ctx.db.get(generationId);
    if (!generation) return false;
    const currentShots = JSON.parse(generation.shotList) as Array<Record<string, unknown>>;
    const repairedShots = JSON.parse(shotList) as Array<Record<string, unknown>>;
    if (currentShots.length !== repairedShots.length || currentShots.some((shot, index) => {
      const repaired = repairedShots[index];
      return shot.shotNumber !== repaired?.shotNumber
        || shot.imageUrl !== repaired.imageUrl
        || shot.imageStorageId !== repaired.imageStorageId
        || shot.imageStatus !== repaired.imageStatus;
    })) throw new Error("Treatment repair cannot change saved image assets or shot order.");
    JSON.parse(selectedConcept);
    JSON.parse(visualBible);
    await ctx.db.patch(generationId, { selectedConcept, visualBible, shotList });
    return true;
  },
});

export const attachIdentityReferences = mutation({
  args: {
    generationId: v.id("generations"),
    faceReferenceStorageId: v.id("_storage"),
    faceReferenceUrl: v.string(),
    productReferenceStorageId: v.id("_storage"),
    productReferenceUrl: v.string(),
  },
  handler: async (ctx, { generationId, ...references }) => {
    if (!await ctx.db.get(generationId)) return false;
    await ctx.db.patch(generationId, references);
    return true;
  },
});

export const attachFinalVideo = mutation({
  args: {
    generationId: v.id("generations"),
    finalVideoStorageId: v.id("_storage"),
    finalVideoUrl: v.string(),
  },
  handler: async (ctx, { generationId, finalVideoStorageId, finalVideoUrl }) => {
    if (!await ctx.db.get(generationId)) return false;
    await ctx.db.patch(generationId, { finalVideoStorageId, finalVideoUrl });
    return true;
  },
});

export const attachImage = mutation({
  args: {
    generationId: v.id("generations"),
    shotNumber: v.number(),
    imageStorageId: v.id("_storage"),
    imageUrl: v.string(),
  },
  handler: async (ctx, { generationId, shotNumber, imageStorageId, imageUrl }) => {
    const generation = await ctx.db.get(generationId);
    if (!generation) return false;

    const shots = JSON.parse(generation.shotList) as Array<Record<string, unknown>>;
    const nextShots = shots.map((shot) => shot.shotNumber === shotNumber ? {
      ...shot,
      imageStatus: "complete",
      imageStorageId,
      imageUrl,
      imageError: undefined,
    } : shot);
    await ctx.db.patch(generationId, { shotList: JSON.stringify(nextShots) });
    return true;
  },
});

export const markImageBlocked = mutation({
  args: { generationId: v.id("generations"), shotNumber: v.number(), reason: v.string() },
  handler: async (ctx, { generationId, shotNumber, reason }) => {
    const generation = await ctx.db.get(generationId);
    if (!generation) return false;
    const shots = JSON.parse(generation.shotList) as Array<Record<string, unknown>>;
    const nextShots = shots.map((shot) => shot.shotNumber === shotNumber ? { ...shot, imageStatus: "blocked", imageError: reason, imageUrl: undefined, imageStorageId: undefined } : shot);
    await ctx.db.patch(generationId, { shotList: JSON.stringify(nextShots) });
    return true;
  },
});

export const markImageFailed = mutation({
  args: { generationId: v.id("generations"), shotNumber: v.number(), reason: v.string() },
  handler: async (ctx, { generationId, shotNumber, reason }) => {
    const generation = await ctx.db.get(generationId);
    if (!generation) return false;
    const shots = JSON.parse(generation.shotList) as Array<Record<string, unknown>>;
    const nextShots = shots.map((shot) => shot.shotNumber === shotNumber ? { ...shot, imageStatus: "failed", imageError: reason, imageUrl: undefined, imageStorageId: undefined } : shot);
    await ctx.db.patch(generationId, { shotList: JSON.stringify(nextShots) });
    return true;
  },
});
