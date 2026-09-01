import { NextResponse } from "next/server";
import { advanceVideoAssembly, AssemblyProgressError } from "@/lib/video-assembly-progress";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 300;
export const runtime = "nodejs";

const get = async () => {
  return NextResponse.json({
    error: "Use POST to assemble a film.",
    acceptedMethod: "POST",
    requiredField: "generationId",
  }, { status: 405, headers: { Allow: "POST" } });
};

const post = async (request: Request) => {
  const { generationId, force, narration } = await request.json().catch(() => ({})) as { generationId?: string; force?: boolean; narration?: string[] };
  if (!generationId) return NextResponse.json({ error: "A production ID is required." }, { status: 400 });
  try {
    const result = await advanceVideoAssembly(generationId, { force, narration });
    return NextResponse.json({ production: result.production, assembly: { position: result.position, total: result.production?.clips.length ?? 6 } }, { status: result.complete ? 200 : 202 });
  } catch (error) {
    if (error instanceof AssemblyProgressError) return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
    throw error;
  }
};

export const GET = withJsonErrors(get);
export const POST = withJsonErrors(post);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
