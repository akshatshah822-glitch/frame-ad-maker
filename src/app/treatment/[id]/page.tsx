import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TreatmentView } from "@/components/treatment-view";
import { getTreatmentById } from "@/lib/treatment-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const treatment = await getTreatmentById(id);
  return treatment ? { title: `${treatment.concept.conceptName} — FRAME`, description: treatment.concept.idea } : { title: "Treatment not found — FRAME" };
}

export default async function TreatmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const treatment = await getTreatmentById(id);
  if (!treatment) notFound();
  return <TreatmentView treatment={treatment} />;
}
