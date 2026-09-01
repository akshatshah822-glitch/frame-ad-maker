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
export const beginAssembly = mutation({ args: { id: v.id("videoProductions"), force: v.optional(v.boolean()) }, handler: async (ctx, { id, force }) => { const production = await ctx.db.get(id); if (!production || (production.status === "assembling" && !force) || (production.status === "ready" && !force)) return false; const clips = JSON.parse(production.clips) as Array<{ status: string }>; if (!clips.every((clip) => clip.status === "complete")) return false; await ctx.db.patch(id, { status: "assembling", assemblyStartedAt: Date.now(), updatedAt: Date.now(), error: undefined }); return true; } });
export const claimAssemblyStep = mutation({
  args: { id: v.id("videoProductions"), force: v.optional(v.boolean()), narration: v.optional(v.array(v.string())) },
  handler: async (ctx, { id, force, narration }) => {
    const production = await ctx.db.get(id);
    if (!production) return { ok: false as const, reason: "missing" };
    const clips = JSON.parse(production.clips) as Array<{ status: string }>;
    if (!clips.length || !clips.every((clip) => clip.status === "complete")) return { ok: false as const, reason: "clips_not_ready" };
    if (production.status === "ready" && !force) return { ok: false as const, reason: "ready" };
    const now = Date.now();
    const reset = Boolean(force && production.status === "ready");
    const currentPosition = reset ? 0 : production.assemblyPosition ?? 0;
    if (currentPosition >= clips.length) return { ok: false as const, reason: "complete" };
    if (!reset && production.assemblyClaimPosition && production.assemblyClaimedAt && now - production.assemblyClaimedAt < 290_000) return { ok: false as const, reason: "busy", position: production.assemblyClaimPosition };
    const position = currentPosition + 1;
    await ctx.db.patch(id, {
      status: "assembling", assemblyStartedAt: reset || !production.assemblyStartedAt ? now : production.assemblyStartedAt,
      assemblyPosition: reset ? 0 : currentPosition, assemblyStorageId: reset ? undefined : production.assemblyStorageId,
      assemblyUrl: reset ? undefined : production.assemblyUrl, assemblyStepDurations: reset ? "[]" : production.assemblyStepDurations, assemblyNarration: narration ? JSON.stringify(narration) : reset ? undefined : production.assemblyNarration,
      assemblyClaimPosition: position, assemblyClaimedAt: now, finalVideoStorageId: reset ? undefined : production.finalVideoStorageId,
      finalVideoUrl: reset ? undefined : production.finalVideoUrl, technicalQa: reset ? undefined : production.technicalQa,
      finalReadyAt: reset ? undefined : production.finalReadyAt, error: undefined, updatedAt: now,
    });
    return { ok: true as const, position };
  },
});
export const saveAssemblyStep = mutation({
  args: { id: v.id("videoProductions"), position: v.number(), storageId: v.id("_storage"), mediaUrl: v.string(), durationMs: v.number(), technicalQa: v.optional(v.string()) },
  handler: async (ctx, { id, position, storageId, mediaUrl, durationMs, technicalQa }) => {
    const production = await ctx.db.get(id);
    if (!production || production.assemblyClaimPosition !== position || (production.assemblyPosition ?? 0) !== position - 1) return false;
    const durations = production.assemblyStepDurations ? JSON.parse(production.assemblyStepDurations) as number[] : [];
    durations[position - 1] = durationMs;
    const final = Boolean(technicalQa);
    await ctx.db.patch(id, { status: final ? "ready" : "generating", assemblyPosition: position, assemblyStorageId: storageId, assemblyUrl: mediaUrl, assemblyStepDurations: JSON.stringify(durations), assemblyClaimPosition: undefined, assemblyClaimedAt: undefined, finalVideoStorageId: final ? storageId : production.finalVideoStorageId, finalVideoUrl: final ? mediaUrl : production.finalVideoUrl, technicalQa: technicalQa ?? production.technicalQa, finalReadyAt: final ? Date.now() : production.finalReadyAt, error: undefined, updatedAt: Date.now() });
    return true;
  },
});
export const failAssemblyStep = mutation({
  args: { id: v.id("videoProductions"), position: v.number(), error: v.string() },
  handler: async (ctx, { id, position, error }) => {
    const production = await ctx.db.get(id);
    if (!production || production.assemblyClaimPosition !== position) return false;
    await ctx.db.patch(id, { status: "assembling", assemblyClaimPosition: undefined, assemblyClaimedAt: undefined, error, updatedAt: Date.now() });
    return true;
  },
});
export const finish = mutation({ args: { id: v.id("videoProductions"), finalVideoStorageId: v.id("_storage"), finalVideoUrl: v.string(), technicalQa: v.string() }, handler: (ctx, { id, ...asset }) => ctx.db.patch(id, { ...asset, status: "ready", finalReadyAt: Date.now(), updatedAt: Date.now(), error: undefined }) });
export const setStatus = mutation({ args: { id: v.id("videoProductions"), status: v.string(), error: v.optional(v.string()) }, handler: (ctx, { id, status, error }) => ctx.db.patch(id, { status, error, updatedAt: Date.now() }) });
