import { NextResponse } from "next/server";
import { treatmentVideoFilename } from "@/lib/filename";
import { getTreatmentById } from "@/lib/treatment-data";
import { getVideoProduction } from "@/lib/video-production";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const get = async (_request: Request, { params }: { params: Promise<{ generationId: string }> }) => {
  const { generationId } = await params;
  const [production, treatment] = await Promise.all([getVideoProduction(generationId), getTreatmentById(generationId)]);
  if (!production?.finalVideoUrl || production.status !== "ready" || !treatment) return NextResponse.json({ error: "This film is not ready to download." }, { status: 404 });
  const upstream = await fetch(production.finalVideoUrl);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "This film could not be downloaded." }, { status: 502 });
  const headers = new Headers({ "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="${treatmentVideoFilename(treatment.generation.title)}"`, "Cache-Control": "private, max-age=0, must-revalidate" });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
};

export const GET = withJsonErrors(get);
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const OPTIONS = methodNotAllowed(["GET"]);
