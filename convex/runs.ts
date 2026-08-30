import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { clientId: v.string(), brief: v.string() },
  handler: async (ctx, args) => ctx.db.insert("runs", { ...args, status: "writing_directions", step: "Writing creative directions", createdAt: Date.now(), updatedAt: Date.now() }),
});

export const getById = query({
  args: { id: v.id("runs") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const directionsReady = mutation({
  args: { id: v.id("runs"), concepts: v.string() },
  handler: async (ctx, { id, concepts }) => {
    if (!await ctx.db.get(id)) return false;
    await ctx.db.patch(id, { concepts, status: "directions_ready", step: "Creative directions ready", error: undefined, updatedAt: Date.now() });
    return true;
  },
});

export const fail = mutation({
  args: { id: v.id("runs"), step: v.string(), error: v.string() },
  handler: async (ctx, { id, step, error }) => {
    if (!await ctx.db.get(id)) return false;
    await ctx.db.patch(id, { status: "failed", step, error, updatedAt: Date.now() });
    return true;
  },
});

export const setStage = mutation({
  args: { id: v.id("runs"), status: v.string(), step: v.string(), currentCount: v.optional(v.number()), totalCount: v.optional(v.number()), generationId: v.optional(v.id("generations")) },
  handler: async (ctx, { id, ...stage }) => {
    if (!await ctx.db.get(id)) return false;
    await ctx.db.patch(id, { ...stage, error: undefined, updatedAt: Date.now() });
    return true;
  },
});
