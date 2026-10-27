// YouTube class → transcript, for "Write the sheet from a YouTube class".
// Two paths, and the log always says which one ran:
//   youtube-captions  the video's own caption track (auto or uploaded), fetched from the watch page
//   pasted            the educator pasted YouTube's "Show transcript" text (used when captions can't be fetched)

export type TranscriptLine = { start: number; text: string };
export type YoutubeVideo = { id: string; title: string; durationSeconds: number; lines: TranscriptLine[]; path: "youtube-captions" | "pasted"; language: string };

export class YoutubeTranscriptError extends Error {
  constructor(message: string, readonly code = "YOUTUBE_TRANSCRIPT_FAILED") { super(message); }
}

/** Accepts youtube.com/watch?v=, youtu.be/, /live/, /shorts/ and /embed/ links (with or without t=). */
export function youtubeVideoId(link: string) {
  const text = link.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url: URL;
  try { url = new URL(text.startsWith("http") ? text : `https://${text}`); } catch { throw new YoutubeTranscriptError("That is not a YouTube link.", "YOUTUBE_LINK_INVALID"); }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.slice(1, 12);
  else if (host.endsWith("youtube.com")) id = url.searchParams.get("v") ?? url.pathname.match(/\/(?:live|shorts|embed)\/([\w-]{11})/)?.[1] ?? "";
  if (!/^[\w-]{11}$/.test(id)) throw new YoutubeTranscriptError("That is not a YouTube video link.", "YOUTUBE_LINK_INVALID");
  return id;
}

/** "1:02:03" / "12:05" / "5" → seconds. */
export function clockToSeconds(clock: string) {
  const parts = clock.trim().split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function secondsToClock(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** YouTube's "Show transcript" copy: a time on its own line (or at the start of a line), then the words. */
export function parsePastedTranscript(text: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let current: TranscriptLine | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(\d{1,2}(?::\d{2}){1,2})\s*(.*)$/);
    if (match) {
      if (current?.text) lines.push(current);
      current = { start: clockToSeconds(match[1]), text: match[2] ?? "" };
    } else if (current) current.text = `${current.text} ${line}`.trim();
  }
  if (current?.text) lines.push(current);
  return lines.filter((line) => Number.isFinite(line.start) && line.text);
}

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };
const BROWSER_HEADERS = { "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

function playerResponse(html: string) {
  const start = html.indexOf("ytInitialPlayerResponse = ");
  if (start < 0) return null;
  let depth = 0; let index = html.indexOf("{", start); const from = index;
  let inString = false; let escaped = false;
  for (; index < html.length; index += 1) {
    const char = html[index];
    if (inString) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === "\"") inString = false; continue; }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") { depth -= 1; if (depth === 0) break; }
  }
  try { return JSON.parse(html.slice(from, index + 1)) as Record<string, unknown>; } catch { return null; }
}

/** Hindi or English captions first (uploaded before auto), then whatever exists. */
export function pickCaptionTrack(tracks: CaptionTrack[]) {
  const rank = (track: CaptionTrack) => (track.languageCode.startsWith("hi") ? 0 : track.languageCode.startsWith("en") ? 2 : 4) + (track.kind === "asr" ? 1 : 0);
  return [...tracks].sort((a, b) => rank(a) - rank(b))[0];
}

export function parseJson3Captions(json: unknown): TranscriptLine[] {
  const events = (json as { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] })?.events ?? [];
  return events.map((event) => ({ start: (event.tStartMs ?? 0) / 1000, text: (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("").replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text);
}

export async function fetchYoutubeTranscript(link: string, fetchImpl: typeof fetch = fetch): Promise<YoutubeVideo> {
  const id = youtubeVideoId(link);
  const page = await fetchImpl(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: BROWSER_HEADERS }).catch(() => null);
  if (!page?.ok) throw new YoutubeTranscriptError(`YouTube did not open the video (HTTP ${page?.status ?? "no answer"}). Paste the transcript instead.`);
  const player = playerResponse(await page.text());
  const details = (player?.videoDetails ?? {}) as { title?: string; lengthSeconds?: string };
  const tracks = ((player?.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } | undefined)?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  const track = pickCaptionTrack(tracks);
  if (!track) throw new YoutubeTranscriptError("This video has no captions FRAME can read. Open it on YouTube → ⋯ → Show transcript, copy all of it and paste it here.", "YOUTUBE_NO_CAPTIONS");
  const captions = await fetchImpl(`${track.baseUrl}&fmt=json3`, { headers: BROWSER_HEADERS }).catch(() => null);
  const body = captions?.ok ? await captions.text() : "";
  let lines: TranscriptLine[] = [];
  try { lines = body ? parseJson3Captions(JSON.parse(body)) : []; } catch { lines = []; }
  if (!lines.length) throw new YoutubeTranscriptError("YouTube did not hand over the captions for this video. Open it on YouTube → ⋯ → Show transcript, copy all of it and paste it here.", "YOUTUBE_CAPTIONS_EMPTY");
  const durationSeconds = Number(details.lengthSeconds) || Math.ceil(lines.at(-1)!.start + 10);
  console.info(`Youtube transcript: path youtube-captions, video ${id}, language ${track.languageCode}${track.kind === "asr" ? " (auto)" : ""}, ${lines.length} lines, ${Math.round(durationSeconds / 60)} min`);
  return { id, title: details.title ?? "", durationSeconds, lines, path: "youtube-captions", language: track.languageCode };
}

export function pastedVideo(link: string, text: string): YoutubeVideo {
  const lines = parsePastedTranscript(text);
  if (lines.length < 5) throw new YoutubeTranscriptError("The pasted transcript has no times in it. Copy it from YouTube's \"Show transcript\" panel with the timestamps.", "TRANSCRIPT_PASTE_INVALID");
  let id = "";
  try { id = youtubeVideoId(link); } catch { id = ""; }
  console.info(`Youtube transcript: path pasted, video ${id || "unknown"}, ${lines.length} lines`);
  return { id, title: "", durationSeconds: Math.ceil(lines.at(-1)!.start + 10), lines, path: "pasted", language: "pasted" };
}

/** The lines spoken between two points of the class (seconds). */
export function transcriptWindow(lines: TranscriptLine[], fromSeconds: number, toSeconds: number) {
  return lines.filter((line) => line.start >= fromSeconds && line.start < toSeconds);
}
