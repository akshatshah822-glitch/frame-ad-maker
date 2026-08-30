import { PDFDocument, PDFImage, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { getShotDisplay, hasDialogue } from "@/lib/treatment";
import type { TreatmentData } from "@/lib/types";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 48;
const INK = rgb(16 / 255, 27 / 255, 54 / 255);
const MUTED = rgb(101 / 255, 112 / 255, 134 / 255);
const CORAL = rgb(1, 92 / 255, 70 / 255);
const PAPER = rgb(245 / 255, 247 / 255, 248 / 255);

function winAnsiSafe(text: string) {
  return text
    .replace(/[→⇒⟶]/g, "->")
    .replace(/[←⇐⟵]/g, "<-")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = winAnsiSafe(text).replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color = INK, lineHeight = size * 1.35, maxLines = 8) {
  const lines = wrapText(text, font, size, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, font, size, color }));
  return y - lines.length * lineHeight;
}

function label(page: PDFPage, text: string, x: number, y: number, bold: PDFFont) {
  page.drawText(winAnsiSafe(text).toUpperCase(), { x, y, font: bold, size: 8, color: CORAL });
}

function addBrand(page: PDFPage, bold: PDFFont, right = false) {
  page.drawText("FRAME ///", { x: right ? PAGE_WIDTH - MARGIN - 64 : MARGIN, y: PAGE_HEIGHT - 31, font: bold, size: 9, color: INK });
}

async function embedRemoteImage(pdf: PDFDocument, imageUrl?: string): Promise<PDFImage | null> {
  if (!imageUrl || imageUrl.startsWith("data:")) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    try { return await pdf.embedJpg(bytes); }
    catch {
      try { return await pdf.embedPng(bytes); }
      catch { return null; }
    }
  } catch { return null; }
}

export async function buildTreatmentPdf(treatment: TreatmentData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${treatment.concept.conceptName} — FRAME`);
  pdf.setAuthor("FRAME");
  pdf.setSubject(treatment.concept.idea);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  cover.drawRectangle({ x: 0, y: 0, width: 14, height: PAGE_HEIGHT, color: CORAL });
  addBrand(cover, bold);
  label(cover, treatment.brief.intent === "cinematic" ? "Cinematic visual treatment" : "Performance advertising treatment", MARGIN, 430, bold);
  drawWrapped(cover, treatment.concept.conceptName, MARGIN, 370, 650, bold, 46, INK, 50, 3);
  drawWrapped(cover, treatment.concept.idea, MARGIN, 250, 570, italic, 19, INK, 26, 4);
  label(cover, "Brand / Product", MARGIN, 115, bold);
  drawWrapped(cover, treatment.brief.brandProduct, MARGIN, 96, 430, regular, 12, INK, 16, 3);
  label(cover, "Platform", 650, 115, bold);
  cover.drawText(treatment.brief.platform, { x: 650, y: 96, font: regular, size: 12, color: INK });

  const direction = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  addBrand(direction, bold, true);
  label(direction, "Creative idea", MARGIN, 520, bold);
  let y = drawWrapped(direction, treatment.concept.idea, MARGIN, 490, 745, bold, 25, INK, 31, 4) - 18;
  label(direction, treatment.brief.intent === "cinematic" ? "Logline" : "What this tests", MARGIN, y, bold);
  y = drawWrapped(direction, treatment.brief.intent === "cinematic" ? (treatment.concept.logline || treatment.concept.idea) : (treatment.concept.whatThisTests || treatment.brief.testObjective || ""), MARGIN, y - 22, 350, bold, 11, INK, 16, 6) - 18;
  label(direction, "Story", MARGIN, y, bold);
  y = drawWrapped(direction, treatment.concept.story, MARGIN, y - 22, 350, regular, 11, INK, 16, 9) - 20;
  label(direction, "Visual world", MARGIN, y, bold);
  drawWrapped(direction, treatment.concept.visualWorld, MARGIN, y - 22, 350, regular, 11, INK, 16, 9);
  label(direction, "Visual direction", 445, 357, bold);
  let vy = drawWrapped(direction, treatment.generation.visualBible.subject, 445, 333, 345, regular, 10, INK, 14, 5) - 12;
  vy = drawWrapped(direction, treatment.generation.visualBible.product, 445, vy, 345, regular, 10, INK, 14, 5) - 12;
  vy = drawWrapped(direction, treatment.generation.visualBible.location, 445, vy, 345, regular, 10, INK, 14, 5) - 12;
  drawWrapped(direction, `${treatment.generation.visualBible.colorPalette.join(" · ")}\n${treatment.generation.visualBible.lighting}`, 445, vy, 345, regular, 10, MUTED, 14, 6);

  const images = await Promise.all(treatment.generation.shots.map((shot) => embedRemoteImage(pdf, shot.imageUrl)));
  treatment.generation.shots.forEach((shot, index) => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    addBrand(page, bold, true);
    const display = getShotDisplay(shot);
    label(page, `Shot ${String(shot.shotNumber).padStart(2, "0")} / ${shot.narrativeBeat || shot.purpose}`, MARGIN, 528, bold);
    page.drawText(`${shot.startTime}–${shot.endTime} sec`, { x: 720, y: 528, font: bold, size: 9, color: MUTED });
    const image = images[index];
    const imageBox = { x: MARGIN, y: 188, width: 460, height: 310 };
    if (image) {
      const scale = Math.min(imageBox.width / image.width, imageBox.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: imageBox.x + (imageBox.width - width) / 2, y: imageBox.y + (imageBox.height - height) / 2, width, height });
    } else {
      page.drawRectangle({ ...imageBox, color: PAPER, borderColor: INK, borderWidth: 1 });
      page.drawText("FRAME NOT RENDERED", { x: imageBox.x + 18, y: imageBox.y + imageBox.height / 2, font: bold, size: 11, color: MUTED });
    }
    let sy = 480;
    label(page, "Visual", 540, sy, bold);
    sy = drawWrapped(page, display.visual, 540, sy - 21, 250, regular, 12, INK, 17, 7) - 18;
    label(page, "Camera", 540, sy, bold);
    sy = drawWrapped(page, display.camera, 540, sy - 21, 250, regular, 11, INK, 16, 5) - 18;
    label(page, "Action", 540, sy, bold);
    sy = drawWrapped(page, display.action, 540, sy - 21, 250, regular, 11, INK, 16, 6) - 18;
    label(page, "VO / Audio", 540, sy, bold);
    drawWrapped(page, [hasDialogue(shot.voiceoverOrDialogue) ? shot.voiceoverOrDialogue : "", shot.audio].filter(Boolean).join(" · "), 540, sy - 21, 250, regular, 10, MUTED, 14, 8);
    page.drawLine({ start: { x: MARGIN, y: 155 }, end: { x: PAGE_WIDTH - MARGIN, y: 155 }, thickness: 1, color: rgb(.8, .82, .86) });
    label(page, "Production notes", MARGIN, 131, bold);
    drawWrapped(page, `${shot.lighting} ${shot.locationAndProps} Product: ${shot.productPresence}`, MARGIN, 110, PAGE_WIDTH - MARGIN * 2, regular, 9, MUTED, 13, 6);
  });

  return pdf.save();
}
