import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPedagogySpeechRequest, pedagogyVoiceCacheIdentity } from "@/lib/pedagogy-voice";

/**
 * Disk cache so the same narration line is voiced (and grammar-checked) once,
 * not once on upload and again on Generate. Keys include the full voice settings,
 * so changing the voice brief, model or speed automatically makes new audio.
 */
export const DEFAULT_PEDAGOGY_CACHE_DIRECTORY = join(tmpdir(), "frame-pedagogy-cache");

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function narrationCacheKey(narration: string) {
  const { input, ...voiceSettings } = buildPedagogySpeechRequest(narration);
  const educatorVoice = pedagogyVoiceCacheIdentity();
  // Default voice keeps its original key, so audio cached before this change is still reused.
  return hash(JSON.stringify(educatorVoice ? { kind: "narration-v1", input, voiceSettings, educatorVoice } : { kind: "narration-v1", input, voiceSettings }));
}

export function grammarCacheKey(narration: string, reviewerId: string) {
  return hash(JSON.stringify({ kind: "grammar-v1", reviewerId, input: narration.trim() }));
}

export async function readCachedNarration(narration: string, directory = DEFAULT_PEDAGOGY_CACHE_DIRECTORY) {
  try {
    return new Uint8Array(await readFile(join(directory, `${narrationCacheKey(narration)}.mp3`)));
  } catch {
    return null;
  }
}

export async function storeCachedNarration(narration: string, audio: Uint8Array, directory = DEFAULT_PEDAGOGY_CACHE_DIRECTORY) {
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${narrationCacheKey(narration)}.mp3`), audio);
  } catch (error) {
    console.warn("Pedagogy narration cache write failed", { path: "uncached", reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
  }
}

export async function readCachedJson<T>(key: string, directory = DEFAULT_PEDAGOGY_CACHE_DIRECTORY): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(directory, `${key}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function storeCachedJson(key: string, value: unknown, directory = DEFAULT_PEDAGOGY_CACHE_DIRECTORY) {
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${key}.json`), JSON.stringify(value), "utf8");
  } catch (error) {
    console.warn("Pedagogy grammar cache write failed", { path: "uncached", reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
  }
}

/** List-price estimate: gpt-4o-mini-tts ~ $0.015 per minute of generated audio. */
export const ESTIMATED_TTS_USD_PER_MINUTE = 0.015;
