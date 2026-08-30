import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { email: v.string(), source: v.string() },
  handler: async (ctx, args) => ctx.db.insert("signups", { ...args, createdAt: Date.now() }),
});

export const latest = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => ctx.db.query("signups").order("desc").take(Math.min(limit ?? 20, 100)),
});
