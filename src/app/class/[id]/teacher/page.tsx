import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeacherInbox } from "@/components/teacher-inbox";
import { ClassRoomError, readClass } from "@/lib/class-room";

export const dynamic = "force-dynamic";

async function load(id: string) {
  try { return await readClass(id); } catch (error) { if (error instanceof ClassRoomError) notFound(); throw error; }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const info = await load((await params).id);
  return { title: `Doubts · ${info.title}` };
}

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const info = await load((await params).id);
  return <TeacherInbox classId={info.id} title={info.title} chapters={info.chapters} />;
}
