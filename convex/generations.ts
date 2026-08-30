import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const save = mutation({
  args: { intent: v.optional(v.string()), testObjective: v.optional(v.string()), testObjectiveOther: v.optional(v.string()), preserveDetails: v.optional(v.string()), brandProduct: v.string(), audience: v.string(), proposition: v.string(), platform: v.string(), visualTones: v.array(v.string()), selectedConcept: v.string(), brandBible: v.optional(v.string()), creativeGrammar: v.optional(v.string()), visualBible: v.string(), title: v.string(), shotList: v.string() },
  handler: async (ctx, args) => ctx.db.insert("generations", { ...args, createdAt: Date.now() }),
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
    } : shot);
    await ctx.db.patch(generationId, { shotList: JSON.stringify(nextShots) });
    return true;
  },
});
