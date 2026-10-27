import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassPlayer } from "@/components/class-player";
import { ClassRoomError, readClass } from "@/lib/class-room";

export const dynamic = "force-dynamic";

async function load(id: string) {
  try { return await readClass(id); } catch (error) { if (error instanceof ClassRoomError) notFound(); throw error; }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const info = await load((await params).id);
  return { title: `${info.title} · FRAME class` };
}

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const info = await load((await params).id);
  return <ClassPlayer classId={info.id} title={info.title} subtitle={info.subtitle ?? ""} educator={info.educator ?? ""} chapters={info.chapters} />;
}
