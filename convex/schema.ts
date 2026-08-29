import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  generations: defineTable({
    brandProduct: v.optional(v.string()), audience: v.optional(v.string()), proposition: v.optional(v.string()), platform: v.optional(v.string()), visualTones: v.optional(v.array(v.string())),
    brandName: v.optional(v.string()), brandCategory: v.optional(v.string()), targetAudience: v.optional(v.string()), usp: v.optional(v.string()), product: v.optional(v.string()),
    selectedConcept: v.optional(v.string()), visualBible: v.optional(v.string()), title: v.string(), script: v.optional(v.string()), shotList: v.string(), createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),
});
