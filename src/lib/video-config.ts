export const RUNWAY_MODEL = "gen4.5" as const;

const platformVideoConfig = {
  "Instagram / Reels": { runwayRatio: "720:1280", width: 1080, height: 1920 },
  "Meta Ads": { runwayRatio: "832:1104", width: 832, height: 1104 },
  YouTube: { runwayRatio: "1280:720", width: 1280, height: 720 },
  "TV / OTT": { runwayRatio: "1280:720", width: 1280, height: 720 },
} as const;

export function getVideoConfig(platform: string) {
  return platformVideoConfig[platform as keyof typeof platformVideoConfig] ?? platformVideoConfig.YouTube;
}
