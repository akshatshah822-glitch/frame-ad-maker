import { getTreatmentById } from "@/lib/treatment-data";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

const get = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const treatment = await getTreatmentById(id);
  if (!treatment) return Response.json({ error: "This treatment is unavailable." }, { status: 404 });
  return Response.json({ treatment }, { headers: { "Cache-Control": "private, no-store" } });
};

export const GET = withJsonErrors(get);
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const OPTIONS = methodNotAllowed(["GET"]);
