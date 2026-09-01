"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./landing-film-carousel.module.css";

const films = [
  {
    label: "EV city film",
    src: "/frame-launch-ad.mp4",
    poster: "/frame-launch-poster.jpg",
  },
  {
    label: "Time-Freezing Hydration",
    src: "https://valiant-cod-559.convex.cloud/api/storage/ccb093f3-e4b9-4941-b492-01d919056d79",
    poster: "https://valiant-cod-559.convex.cloud/api/storage/7c8630d7-91b4-42f4-8ab0-ae0a562074ee",
  },
] as const;

export function LandingFilmCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const playOnly = useCallback((index: number) => {
    videoRefs.current.forEach((video, videoIndex) => {
      if (!video) return;
      if (videoIndex === index) void video.play().catch(() => { /* Muted playback may be blocked. */ });
      else video.pause();
    });
  }, []);

  useEffect(() => {
    playOnly(0);
  }, [playOnly]);

  const updateActiveFilm = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const index = Math.max(0, Math.min(films.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
    if (index === activeIndex) return;
    setActiveIndex(index);
    playOnly(index);
  };

  const goTo = (index: number) => {
    trackRef.current?.children[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return <div className={styles.carousel} aria-label="Finished advertisements">
    <div className={styles.track} ref={trackRef} onScroll={updateActiveFilm}>
      {films.map((film, index) => <div className={styles.slide} key={film.src} aria-label={`${index + 1} of ${films.length}: ${film.label}`}>
        <video
          ref={(node) => { videoRefs.current[index] = node; }}
          autoPlay={index === 0}
          muted
          loop
          playsInline
          preload={index === 0 ? "metadata" : "none"}
          poster={film.poster}
          aria-label={index === 0 ? "A finished advertisement created with FRAME" : `Finished ${film.label} advertisement made by FRAME`}
          onPlay={() => videoRefs.current.forEach((video, videoIndex) => { if (videoIndex !== index) video?.pause(); })}
        >
          <source src={film.src} type="video/mp4" />
        </video>
      </div>)}
    </div>
    <div className={styles.controls} aria-label="Choose a film">
      {films.map((film, index) => <button type="button" key={film.src} aria-label={`Show ${film.label}`} aria-current={activeIndex === index ? "true" : undefined} onClick={() => goTo(index)}>{String(index + 1).padStart(2, "0")}</button>)}
    </div>
  </div>;
}
