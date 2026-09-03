export type FrameEvent = "page_view" | "brief_started" | "brief_submitted" | "directions_shown" | "film_shown" | "email_submitted";

const productionHost = "frame-ad-maker.vercel.app";

export function track(event: FrameEvent, properties?: { email?: string; treatmentId?: string }) {
  if (window.location.hostname !== productionHost) return;
  const clientId = window.localStorage.getItem("frame-client-id") || window.crypto.randomUUID();
  window.localStorage.setItem("frame-client-id", clientId);
  const body = JSON.stringify({ event, path: window.location.pathname, email: properties?.email, treatmentId: properties?.treatmentId });
  void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json", "x-frame-client-id": clientId }, body, keepalive: true });
}
