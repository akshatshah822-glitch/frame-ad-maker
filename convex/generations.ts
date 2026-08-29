import { mutation } from "./_generated/server";
import { v } from "convex/values";
export const save = mutation({
  args: { brandProduct: v.string(), audience: v.string(), proposition: v.string(), platform: v.string(), visualTones: v.array(v.string()), selectedConcept: v.string(), visualBible: v.string(), title: v.string(), shotList: v.string() },
  handler: async (ctx, args) => ctx.db.insert("generations", { ...args, createdAt: Date.now() }),
});
