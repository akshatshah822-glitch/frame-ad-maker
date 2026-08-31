import { getTreatmentById } from "@/lib/treatment-data";
import { buildTreatmentPdf } from "@/lib/treatment-pdf";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 60;

const get = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const treatment = await getTreatmentById(id);
  if (!treatment) return Response.json({ error: "This treatment is unavailable." }, { status: 404 });
  try {
    const bytes = await buildTreatmentPdf(treatment);
    const safeName = treatment.concept.conceptName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "treatment";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="frame-${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Treatment PDF generation failed", error);
    return Response.json({ error: "The PDF could not be prepared. Try again." }, { status: 500 });
  }
};

export const GET = withJsonErrors(get);
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const OPTIONS = methodNotAllowed(["GET"]);
