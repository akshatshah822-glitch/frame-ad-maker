import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { email: v.string(), brandName: v.string(), storyboardId: v.id("generations") },
  handler: async (ctx, args) => {
    if (!await ctx.db.get(args.storyboardId)) throw new Error("Storyboard not found");
    return ctx.db.insert("videoRequests", { ...args, createdAt: Date.now() });
  },
});
