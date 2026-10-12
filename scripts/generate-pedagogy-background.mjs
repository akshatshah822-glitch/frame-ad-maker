// Generates one atmospheric 16:9 background for exam-explainer boards.
// Usage: node scripts/generate-pedagogy-background.mjs <name> "<scene description>"
// Writes public/pedagogy-backgrounds/<name>.jpg, which a brief row uses with background = <name>.
// Reads OPENAI_API_KEY from the environment or .env.local. The key is never printed.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";

const [name, ...descriptionParts] = process.argv.slice(2);
const description = descriptionParts.join(" ").trim();
if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name) || !description) {
  console.error('Usage: node scripts/generate-pedagogy-background.mjs <name> "<scene description>"  (name: lowercase letters, numbers, hyphens)');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY && existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set.");
  process.exit(1);
}

const prompt = [
  `Cinematic, atmospheric background plate: ${description}.`,
  "Wide 16:9 composition with calm negative space in the centre for on-screen diagrams.",
  "Deep, moody lighting with navy and warm coral tones, shallow depth of field.",
  "No text, no letters, no numbers, no logos, no brand marks, no watermarks, no recognisable real people.",
].join(" ");

const openai = new OpenAI();
const result = await openai.images.generate({ model: "gpt-image-2", prompt, n: 1, size: "1824x1024", quality: "medium", output_format: "jpeg", output_compression: 85 });
const image = result.data?.[0]?.b64_json;
if (!image) {
  console.error("The image model returned no image.");
  process.exit(1);
}
const directory = join("public", "pedagogy-backgrounds");
await mkdir(directory, { recursive: true });
const outputPath = join(directory, `${name}.jpg`);
await writeFile(outputPath, Buffer.from(image, "base64"));
console.log(`Saved ${outputPath}`);
