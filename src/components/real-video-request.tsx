"use client";

import { useState } from "react";

type Props = { storyboardId?: string };

export function RealVideoRequest({ storyboardId }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "confirmed">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storyboardId) return;
    setStatus("saving");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/video-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), brandName: form.get("brandName"), storyboardId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Your request could not be saved.");
      setStatus("confirmed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your request could not be saved.");
      setStatus("idle");
    }
  }

  if (!storyboardId) return null;
  if (status === "confirmed") return <div className="real-video-confirmation" role="status"><strong>REQUEST RECEIVED</strong><span>We’ll email you about your finished film delivery within 24 hours.</span></div>;

  return <div className="real-video-request">
    <button className="real-video-cta" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Get a finished film for ₹200, delivered in 24h</button>
    <p className="real-video-helper">₹200 delivers a human-reviewed edit, polished sound, and a delivery-ready MP4 within 24 hours.</p>
    <p className="real-video-helper">Nothing starts until you submit the request.</p>
    {open ? <form onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label>
      <label>Brand name<input name="brandName" type="text" autoComplete="organization" required placeholder="Your brand" /></label>
      <label>Storyboard ID<input name="storyboardId" type="text" readOnly value={storyboardId} /></label>
      <button className="video-primary" type="submit" disabled={status === "saving"}>{status === "saving" ? "SAVING…" : "REQUEST FINISHED FILM"}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form> : null}
  </div>;
}
