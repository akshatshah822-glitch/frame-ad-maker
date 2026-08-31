"use client";

import { useState } from "react";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const VIDEO_DURATION_MS = 30_000;
const CROSS_FADE_MS = 400;
const SHOT_WINDOWS = [[0, 4000], [4000, 10_000], [10_000, 14_000], [14_000, 20_000], [20_000, 26_000], [26_000, 30_000]] as const;

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, scale: number, opacity = 1) {
  const coverScale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight) * scale;
  const width = image.naturalWidth * coverScale;
  const height = image.naturalHeight * coverScale;
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
  context.restore();
}

function getWebmMimeType() {
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
}

async function recordStoryboardVideo() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-storyboard-frame]"));
  if (images.length !== SHOT_WINDOWS.length) throw new Error("Six completed storyboard frames are required");
  await Promise.all(images.map((image) => image.decode()));

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") throw new Error("Video recording is unavailable in this browser");
  const drawingContext = context;

  const mimeType = getWebmMimeType();
  if (!mimeType) throw new Error("WebM recording is unavailable in this browser");
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("The browser could not record this video"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(1000);
  const startedAt = performance.now();

  try {
    await new Promise<void>((resolve, reject) => {
    function drawFrame(now: number) {
      try {
        const elapsed = Math.min(now - startedAt, VIDEO_DURATION_MS);
        const shotIndex = SHOT_WINDOWS.findIndex(([, end]) => elapsed < end);
        const index = shotIndex === -1 ? SHOT_WINDOWS.length - 1 : shotIndex;
        const [start, end] = SHOT_WINDOWS[index];
        const progress = Math.min(1, Math.max(0, (elapsed - start) / (end - start)));

        drawingContext.fillStyle = "#000";
        drawingContext.fillRect(0, 0, WIDTH, HEIGHT);
        drawCover(drawingContext, images[index], 1 + (0.08 * progress));

        const fadeProgress = index < images.length - 1 ? Math.max(0, (elapsed - (end - CROSS_FADE_MS)) / CROSS_FADE_MS) : 0;
        if (fadeProgress > 0) drawCover(drawingContext, images[index + 1], 1, Math.min(1, fadeProgress));

        if (elapsed >= VIDEO_DURATION_MS) {
          resolve();
          return;
        }
        requestAnimationFrame(drawFrame);
      } catch (error) {
        reject(error);
      }
    }
    requestAnimationFrame(drawFrame);
    });
  } catch (error) {
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }

  recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((track) => track.stop());
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "frame-ad.webm";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StoryboardVideoDownload() {
  const [status, setStatus] = useState<"idle" | "recording" | "error">("idle");

  async function download() {
    setStatus("recording");
    try {
      await recordStoryboardVideo();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return <>
    <button className="export-button" type="button" disabled={status === "recording"} onClick={download}>{status === "recording" ? "RECORDING 30S…" : "DOWNLOAD 30S VIDEO"}</button>
    {status === "error" ? <span className="video-download-error" role="status">Video download is unavailable in this browser.</span> : null}
  </>;
}
