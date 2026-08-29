import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByGeneration = query({ args: { generationId: v.id("generations") }, handler: (ctx, { generationId }) => ctx.db.query("videoProductions").withIndex("by_generation", (q) => q.eq("generationId", generationId)).unique() });
export const getById = query({ args: { id: v.id("videoProductions") }, handler: (ctx, { id }) => ctx.db.get(id) });

export const begin = mutation({
  args: { generationId: v.id("generations"), clips: v.string() },
  handler: async (ctx, { generationId, clips }) => {
    const existing = await ctx.db.query("videoProductions").withIndex("by_generation", (q) => q.eq("generationId", generationId)).unique();
    if (existing) return { id: existing._id, created: false };
    const activeStatuses = ["creating", "generating", "assembling"];
    let active = 0;
    for (const status of activeStatuses) active += (await ctx.db.query("videoProductions").withIndex("by_status", (q) => q.eq("status", status)).take(2)).length;
    if (active >= 2) throw new Error("ACTIVE_PRODUCTION_LIMIT");
    const now = Date.now();
    const id = await ctx.db.insert("videoProductions", { generationId, status: "creating", provider: "runway", model: "gen4.5", clips, startedAt: now, updatedAt: now });
    return { id, created: true };
  },
});

export const updateClip = mutation({
  args: { id: v.id("videoProductions"), shotNumber: v.number(), clip: v.string(), productionStatus: v.optional(v.string()) },
  handler: async (ctx, { id, shotNumber, clip, productionStatus }) => {
    const production = await ctx.db.get(id);
    if (!production) return false;
    const clips = JSON.parse(production.clips) as Array<Record<string, unknown>>;
    const next = clips.map((item) => item.shotNumber === shotNumber ? JSON.parse(clip) : item);
    await ctx.db.patch(id, { clips: JSON.stringify(next), status: productionStatus ?? production.status, updatedAt: Date.now() });
    return true;
  },
});

export const markClipsReady = mutation({ args: { id: v.id("videoProductions"), totalFinalCredits: v.number() }, handler: async (ctx, { id, totalFinalCredits }) => ctx.db.patch(id, { status: "clips_ready", clipsReadyAt: Date.now(), updatedAt: Date.now(), totalFinalCredits }) });
export const claimRetry = mutation({ args: { id: v.id("videoProductions"), shotNumber: v.number() }, handler: async (ctx, { id, shotNumber }) => { const production = await ctx.db.get(id); if (!production) return false; const clips = JSON.parse(production.clips) as Array<Record<string, unknown>>; const target = clips.find((clip) => clip.shotNumber === shotNumber); if (!target || !["failed", "cancelled"].includes(String(target.status))) return false; const next = clips.map((clip) => clip.shotNumber === shotNumber ? { ...clip, status: "waiting", retries: Number(clip.retries ?? 0) + 1, error: undefined, failureCode: undefined, providerTaskId: undefined } : clip); await ctx.db.patch(id, { clips: JSON.stringify(next), status: "generating", updatedAt: Date.now(), error: undefined }); return true; } });
export const beginAssembly = mutation({ args: { id: v.id("videoProductions") }, handler: async (ctx, { id }) => { const production = await ctx.db.get(id); if (!production || production.status === "ready" || production.status === "assembling") return false; const clips = JSON.parse(production.clips) as Array<{ status: string }>; if (!clips.every((clip) => clip.status === "complete")) return false; await ctx.db.patch(id, { status: "assembling", assemblyStartedAt: Date.now(), updatedAt: Date.now(), error: undefined }); return true; } });
export const finish = mutation({ args: { id: v.id("videoProductions"), finalVideoStorageId: v.id("_storage"), finalVideoUrl: v.string(), technicalQa: v.string() }, handler: (ctx, { id, ...asset }) => ctx.db.patch(id, { ...asset, status: "ready", finalReadyAt: Date.now(), updatedAt: Date.now(), error: undefined }) });
export const setStatus = mutation({ args: { id: v.id("videoProductions"), status: v.string(), error: v.optional(v.string()) }, handler: (ctx, { id, status, error }) => ctx.db.patch(id, { status, error, updatedAt: Date.now() }) });
