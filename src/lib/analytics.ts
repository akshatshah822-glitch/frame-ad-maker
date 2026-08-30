export type FrameEvent = "brief_started" | "brief_submitted" | "directions_shown" | "film_shown" | "email_submitted";

export function track(event: FrameEvent, properties?: { email?: string }) {
  const clientId = window.localStorage.getItem("frame-client-id") || window.crypto.randomUUID();
  window.localStorage.setItem("frame-client-id", clientId);
  const body = JSON.stringify({ event, path: window.location.pathname, email: properties?.email });
  void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json", "x-frame-client-id": clientId }, body, keepalive: true });
}
