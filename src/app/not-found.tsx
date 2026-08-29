import Link from "next/link";

export default function NotFound() {
  return <main className="page not-found-page"><Link className="wordmark" href="/">FRAME<span>{"///"}</span></Link><section><p className="eyebrow">Treatment unavailable</p><h1>This link doesn&apos;t lead to a saved treatment.</h1><p>It may be incomplete, unavailable, or mistyped.</p><Link className="primary-button" href="/">Create a film <span aria-hidden="true">↗</span></Link></section></main>;
}
