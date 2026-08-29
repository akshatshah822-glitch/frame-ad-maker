"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatTreatmentText } from "@/lib/treatment";
import type { TreatmentData } from "@/lib/types";

type Props = {
  treatment: TreatmentData;
  onRestart?: () => void;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy is unavailable");
}

export function CompletionActions({ treatment, onRestart }: Props) {
  const [notice, setNotice] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareUrl = treatment.id && typeof window !== "undefined" ? `${window.location.origin}/treatment/${treatment.id}` : "";

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function announce(message: string) {
    setNotice(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(""), 2400);
  }

  async function copyTreatment() {
    try {
      await copyText(formatTreatmentText(treatment));
      announce("Treatment copied");
    } catch {
      announce("Copy is unavailable in this browser");
    }
  }

  async function copyShareLink() {
    if (!shareUrl) {
      announce("Share link unavailable — this treatment was not saved");
      return;
    }
    try {
      await copyText(shareUrl);
      announce("Share link copied");
    } catch {
      announce("Share link could not be copied");
    }
  }

  return <div className="completion-actions-wrap">
    <div className="completion-actions" aria-label="Treatment actions">
      <button className="primary-button" type="button" onClick={copyTreatment}>Copy treatment <span aria-hidden="true">↗</span></button>
      {treatment.id ? <a className="export-button" href={`/api/treatments/${treatment.id}/pdf`} download>Download PDF</a> : <button className="export-button" type="button" disabled title="PDF needs a saved treatment">Download PDF</button>}
      <button className="export-button" type="button" onClick={copyShareLink} aria-disabled={!treatment.id}>Share link</button>
      {onRestart ? <button className="restart-button" type="button" onClick={onRestart}>Make another film</button> : <Link className="restart-button" href="/">Make a film</Link>}
    </div>
    <p className="action-notice" role="status" aria-live="polite">{notice}</p>
  </div>;
}
