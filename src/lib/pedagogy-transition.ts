import { readFile } from "node:fs/promises";
import sharp from "sharp";

/** Frames and seconds for the dissolve into a new diagram topic. */
export const TOPIC_TRANSITION_FRAMES = 8;
export const TOPIC_TRANSITION_SECONDS = 0.45;

/** One frame of a dissolve: the previous slide with the incoming slide laid over it at `amount` (0 to 1). */
export async function crossfadeFrame(previousPath: string, incoming: Buffer, amount: number) {
  const mix = Math.min(1, Math.max(0, amount));
  const { data, info } = await sharp(incoming).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * mix);
  const overlay = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return sharp(await readFile(previousPath)).composite([{ input: overlay, blend: "over" }]).png().toBuffer();
}
