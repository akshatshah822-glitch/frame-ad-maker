// One-time setup: creates an ElevenLabs instant voice clone from YOUR OWN consented recording
// and prints its voice ID, which you then set as ELEVENLABS_VOICE_ID.
// Usage: node scripts/create-pedagogy-voice.mjs /path/to/your-voice.mp3 "Akshat Hinglish"
// Reads ELEVENLABS_API_KEY from the environment or .env.local. The key is never printed.
// Keep the recording outside this repository: the repository is public.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [samplePath, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim() || "FRAME educator voice";
if (!samplePath || !existsSync(samplePath)) {
  console.error('Usage: node scripts/create-pedagogy-voice.mjs /path/to/your-voice.mp3 "Voice name"');
  process.exit(1);
}
if (resolve(samplePath).startsWith(resolve("."))) {
  console.error("Keep the voice recording outside this repository; it is public.");
  process.exit(1);
}
if (!process.env.ELEVENLABS_API_KEY && existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set.");
  process.exit(1);
}

const form = new FormData();
form.set("name", name);
form.set("description", "FRAME exam-explainer narration. Owner's own voice, recorded with consent.");
form.set("remove_background_noise", "true");
form.append("files", new Blob([await readFile(samplePath)], { type: "audio/mpeg" }), basename(samplePath));

const response = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: form });
const result = await response.json().catch(() => ({}));
if (!response.ok || !result.voice_id) {
  console.error(`Voice creation failed with HTTP ${response.status}.`, result?.detail?.message ?? "");
  process.exit(1);
}
console.log(`Voice created. Set this in .env.local and in Vercel:\nELEVENLABS_VOICE_ID=${result.voice_id}`);
