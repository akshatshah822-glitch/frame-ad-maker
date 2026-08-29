import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { parseStoredTreatment } from "@/lib/treatment";
import type { TreatmentData } from "@/lib/types";

export async function getTreatmentById(id: string): Promise<TreatmentData | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl || !id) return null;
  try {
    const client = new ConvexHttpClient(convexUrl);
    const record = await client.query(anyApi.generations.getById, { id });
    return record ? parseStoredTreatment(record as Record<string, unknown>) : null;
  } catch (error) {
    console.warn("Treatment retrieval failed", error);
    return null;
  }
}
