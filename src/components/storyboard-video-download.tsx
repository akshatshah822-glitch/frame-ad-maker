"use client";

import { useState } from "react";

const WIDTH = 1080;
const HEIGHT = 1920;
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
  let stream: MediaStream | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let stopTimerId: ReturnType<typeof setTimeout> | undefined;

  try {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-storyboard-frame]"));
    if (images.length !== SHOT_WINDOWS.length) throw new Error("Six completed storyboard frames are required");
    await Promise.all(images.map(async (image) => {
      await image.decode();
      if (!image.complete || !image.naturalWidth) throw new Error("A storyboard frame did not finish loading");
    }));

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") throw new Error("Video recording is unavailable in this browser");
    const drawingContext = context;

    const mimeType = getWebmMimeType();
    if (!mimeType) throw new Error("WebM recording is unavailable in this browser");
    stream = canvas.captureStream(0);
    const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (!videoTrack || typeof videoTrack.requestFrame !== "function") throw new Error("Manual video frame capture is unavailable in this browser");
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    let lastLoggedSecond = -1;

    await new Promise<void>((resolve, reject) => {
      let startedAt = 0;

      function drawFrame(now: number) {
        const elapsed = Math.min(now - startedAt, VIDEO_DURATION_MS);
        const elapsedSecond = Math.floor(elapsed / 1000);
        if (elapsedSecond !== lastLoggedSecond) {
          lastLoggedSecond = elapsedSecond;
          console.log(`VIDEO recording second ${elapsedSecond}`);
        }

        const shotIndex = SHOT_WINDOWS.findIndex(([, end]) => elapsed < end);
        const index = shotIndex === -1 ? SHOT_WINDOWS.length - 1 : shotIndex;
        const [start, end] = SHOT_WINDOWS[index];
        const progress = Math.min(1, Math.max(0, (elapsed - start) / (end - start)));

        drawingContext.fillStyle = "#000";
        drawingContext.fillRect(0, 0, WIDTH, HEIGHT);
        drawCover(drawingContext, images[index], 1 + (0.08 * progress));

        const fadeProgress = index < images.length - 1 ? Math.max(0, (elapsed - (end - CROSS_FADE_MS)) / CROSS_FADE_MS) : 0;
        if (fadeProgress > 0) drawCover(drawingContext, images[index + 1], 1, Math.min(1, fadeProgress));
        videoTrack.requestFrame();
      }

      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("The browser could not record this video"));
      recorder.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "frame-ad.webm";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      recorder.start(1000);
      startedAt = performance.now();
      drawFrame(startedAt);
      intervalId = setInterval(() => {
        try {
          drawFrame(performance.now());
        } catch (error) {
          reject(error);
        }
      }, 33);
      stopTimerId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
        try {
          drawFrame(startedAt + VIDEO_DURATION_MS);
        } catch (error) {
          reject(error);
        } finally {
          if (recorder.state !== "inactive") recorder.stop();
        }
      }, VIDEO_DURATION_MS);
    });
  } catch (error) {
    console.error("Storyboard video recording failed", error);
    throw error;
  } finally {
    if (intervalId) clearInterval(intervalId);
    if (stopTimerId) clearTimeout(stopTimerId);
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export function StoryboardVideoDownload() {
  const [buttonText, setButtonText] = useState("DOWNLOAD 30S VIDEO");
  const recording = buttonText === "RECORDING 30S…";

  async function download() {
    setButtonText("RECORDING 30S…");
    try {
      await recordStoryboardVideo();
      setButtonText("DOWNLOAD 30S VIDEO");
    } catch (error) {
      setButtonText(error instanceof Error ? `ERROR: ${error.message}` : "ERROR: VIDEO DOWNLOAD FAILED");
    }
  }

  return <button className="export-button" type="button" disabled={recording} onClick={download}>{buttonText}</button>;
}
