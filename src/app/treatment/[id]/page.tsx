import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TreatmentView } from "@/components/treatment-view";
import { getTreatmentById } from "@/lib/treatment-data";
import { getVideoProduction } from "@/lib/video-production";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const treatment = await getTreatmentById(id);
  if (!treatment) return { title: "Treatment not found — FRAME" };
  const title = treatment.generation.title;
  const description = treatment.concept.idea;
  const image = treatment.generation.shots[0]?.imageUrl;
  return { title: `${title} — FRAME`, description, openGraph: { title, description, type: "website", images: image ? [{ url: image, alt: `${title} — opening storyboard frame` }] : [] }, twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] } };
}

export default async function TreatmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [treatment, production] = await Promise.all([getTreatmentById(id), getVideoProduction(id)]);
  if (!treatment) notFound();
  return <TreatmentView treatment={treatment} initialVideoProduction={production} />;
}
