import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  signups: defineTable({
    email: v.string(),
    source: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),
  videoRequests: defineTable({
    email: v.string(),
    brandName: v.string(),
    storyboardId: v.id("generations"),
    createdAt: v.number(),
  }).index("by_storyboard", ["storyboardId"]).index("by_email", ["email"]),
  runs: defineTable({
    clientId: v.string(),
    brief: v.string(),
    status: v.string(),
    step: v.string(),
    concepts: v.optional(v.string()),
    selectedConcept: v.optional(v.string()),
    generationId: v.optional(v.id("generations")),
    currentCount: v.optional(v.number()),
    totalCount: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_client", ["clientId"]).index("by_status", ["status"]),
  generations: defineTable({
    intent: v.optional(v.string()), testObjective: v.optional(v.string()), testObjectiveOther: v.optional(v.string()), preserveDetails: v.optional(v.string()),
    brandProduct: v.optional(v.string()), audience: v.optional(v.string()), proposition: v.optional(v.string()), platform: v.optional(v.string()), visualTones: v.optional(v.array(v.string())),
    brandName: v.optional(v.string()), brandCategory: v.optional(v.string()), targetAudience: v.optional(v.string()), usp: v.optional(v.string()), product: v.optional(v.string()),
    selectedConcept: v.optional(v.string()), brandBible: v.optional(v.string()), creativeGrammar: v.optional(v.string()), visualBible: v.optional(v.string()), title: v.string(), script: v.optional(v.string()), shotList: v.string(),
    faceReferenceStorageId: v.optional(v.id("_storage")), faceReferenceUrl: v.optional(v.string()),
    productReferenceStorageId: v.optional(v.id("_storage")), productReferenceUrl: v.optional(v.string()),
    finalVideoStorageId: v.optional(v.id("_storage")), finalVideoUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),
  videoProductions: defineTable({
    generationId: v.id("generations"), status: v.string(), provider: v.string(), model: v.string(), clips: v.string(),
    finalVideoStorageId: v.optional(v.id("_storage")), finalVideoUrl: v.optional(v.string()), technicalQa: v.optional(v.string()), error: v.optional(v.string()),
    assemblyPosition: v.optional(v.number()), assemblyStorageId: v.optional(v.id("_storage")), assemblyUrl: v.optional(v.string()), assemblyStepDurations: v.optional(v.string()), assemblyNarration: v.optional(v.string()),
    assemblyClaimPosition: v.optional(v.number()), assemblyClaimedAt: v.optional(v.number()),
    startedAt: v.number(), updatedAt: v.number(), clipsReadyAt: v.optional(v.number()), assemblyStartedAt: v.optional(v.number()), finalReadyAt: v.optional(v.number()), totalFinalCredits: v.optional(v.number()),
  }).index("by_generation", ["generationId"]).index("by_status", ["status"]),
});
