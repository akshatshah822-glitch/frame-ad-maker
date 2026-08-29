import { getTreatmentById } from "@/lib/treatment-data";
import { buildTreatmentPdf } from "@/lib/treatment-pdf";

export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
}
