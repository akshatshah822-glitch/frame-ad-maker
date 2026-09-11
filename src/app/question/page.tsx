import { PedagogyBriefUpload } from "@/components/pedagogy-brief-upload";
import Link from "next/link";

export default function QuestionVideoPage() {
  return <main className="page pedagogy-page">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="FRAME home">FRAME<span>•</span></Link>
      <span>Exam question video</span>
      <Link href="/" className="text-link">Film studio <span>↗</span></Link>
    </header>
    <section className="pedagogy-hero">
      <p className="eyebrow">Exam explainer</p>
      <h1>Teach from<br /><i>the brief.</i></h1>
      <p>Use the teaching plan’s timestamps, board notes, and exact educator narration to draw a 16:9 explainer video.</p>
    </section>
    <PedagogyBriefUpload />
  </main>;
}
