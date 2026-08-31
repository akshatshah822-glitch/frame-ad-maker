"use client";

import { useState } from "react";
import type { Shot } from "@/lib/types";
import { readJsonResponse } from "@/lib/read-json-response";

type Props = { shot: Shot; generationId: string; platform: string; totalShots: number };

export function BlockedShotRetry({ shot, generationId, platform, totalShots }: Props) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(shot.imagePrompt);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState(shot.imageError || "This frame was blocked. Reword it and try again.");

  const retry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    let lastError: unknown;
    try {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          const response = await fetch("/api/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imagePrompt: prompt,
              platform,
              shotNumber: shot.shotNumber,
              generationId,
              totalShots,
              attempt,
              productPresence: shot.productPresence,
              locationAndProps: shot.locationAndProps,
              lighting: shot.lighting,
              cameraFraming: shot.cameraFraming,
              cameraAngle: shot.cameraAngle,
              lensSuggestion: shot.lensSuggestion,
              cameraMovement: shot.cameraMovement,
            }),
          });
          const result = await readJsonResponse<{ error?: string; imageStatus?: "complete" | "blocked"; imageError?: string }>(response);
          if (!response.ok) throw new Error(result.error || "This frame couldn't be retried.");
          if (result.imageStatus === "blocked") {
            setReason(result.imageError || "This frame is still blocked. Reword it and try again.");
            return;
          }
          window.location.reload();
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 750 * (2 ** (attempt - 1))));
        }
      }
      setReason(lastError instanceof Error ? lastError.message : "This frame couldn't be retried after three retries.");
    } finally {
      setWorking(false);
    }
  };

  if (!editing) return <div className="shot-frame-failed"><span>FRAME / {String(shot.shotNumber).padStart(2, "0")} · {shot.imageStatus === "blocked" ? "BLOCKED" : "FAILED"}</span><p>{reason}</p><button type="button" onClick={() => setEditing(true)}>Retry frame</button></div>;

  return <form className="blocked-shot-form" onSubmit={retry}>
    <label htmlFor={`blocked-prompt-${shot.shotNumber}`}>Reword image direction</label>
    <textarea id={`blocked-prompt-${shot.shotNumber}`} value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
    <button type="submit" disabled={working}>{working ? "Retrying…" : "Generate this frame"}</button>
    <small>{reason}</small>
  </form>;
}
