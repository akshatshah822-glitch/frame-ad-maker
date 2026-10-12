import { generateNarrationTrack } from "@/lib/voice";

// Exam-question (pedagogy) narration voice only. The ad/film path keeps using generateNarrationTrack directly.
// When ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are both set, every pedagogy line is spoken in that
// cloned voice. Otherwise FRAME's existing OpenAI "cedar" voice is used. The provider in use is logged.
// If the cloned voice is configured but a request fails, the line fails loudly rather than switching
// voices mid-video.

export type PedagogyVoiceProvider = "elevenlabs-cloned" | "openai-cedar";

type VoiceEnvironment = Partial<Record<"ELEVENLABS_API_KEY" | "ELEVENLABS_VOICE_ID" | "ELEVENLABS_MODEL_ID", string | undefined>> & Record<string, string | undefined>;
type VoiceDependencies = {
  env?: VoiceEnvironment;
  fetch?: typeof fetch;
  openaiTrack?: (narration: string) => Promise<Uint8Array>;
};

export class PedagogyClonedVoiceError extends Error {
  readonly status: number | null;
  constructor(status: number | null) {
    super(`The cloned narration voice request failed${status === null ? "" : ` with HTTP ${status}`}.`);
    this.name = "PedagogyClonedVoiceError";
    this.status = status;
  }
}

export function pedagogyVoiceProvider(env: VoiceEnvironment = process.env): PedagogyVoiceProvider {
  return env.ELEVENLABS_API_KEY?.trim() && env.ELEVENLABS_VOICE_ID?.trim() ? "elevenlabs-cloned" : "openai-cedar";
}

export async function generatePedagogyNarrationTrack(narration: string, dependencies: VoiceDependencies = {}) {
  const env = dependencies.env ?? process.env;
  if (pedagogyVoiceProvider(env) === "openai-cedar") return (dependencies.openaiTrack ?? generateNarrationTrack)(narration);
  const text = narration.trim();
  if (!text) throw new Error("This pedagogy line has no narration.");
  const voiceId = encodeURIComponent(env.ELEVENLABS_VOICE_ID!.trim());
  let response: Response;
  try {
    response = await (dependencies.fetch ?? fetch)(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!.trim(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0, use_speaker_boost: true },
      }),
    });
  } catch {
    console.error("Pedagogy cloned voice request failed", { provider: "elevenlabs-cloned", status: null });
    throw new PedagogyClonedVoiceError(null);
  }
  if (!response.ok) {
    console.error("Pedagogy cloned voice request failed", { provider: "elevenlabs-cloned", status: response.status });
    throw new PedagogyClonedVoiceError(response.status);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.byteLength) throw new PedagogyClonedVoiceError(response.status);
  return audio;
}
