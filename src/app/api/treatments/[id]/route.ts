import { getTreatmentById } from "@/lib/treatment-data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const treatment = await getTreatmentById(id);
  if (!treatment) return Response.json({ error: "This treatment is unavailable." }, { status: 404 });
  return Response.json({ treatment }, { headers: { "Cache-Control": "private, no-store" } });
}
