export type VideoProvider = "youtube" | "vimeo" | "instagram" | "unknown";

export interface VideoItem {
  id: string;
  label: string;
  url: string;
  provider?: VideoProvider;
  description?: string;
  date?: string;
  autoplay?: boolean;
  loop?: boolean;
}

export interface VideoGroup {
  id: string;
  label: string;
  date?: string;
  videos: VideoItem[];
}

export interface VideoEmbed {
  provider: VideoProvider;
  iframe?: {
    src: string;
    title: string;
    allow?: string;
    allowFullscreen?: boolean;
  };
  html?: string;
}

const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
const VIMEO_ALLOW =
  "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media";

const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;
const VIMEO_REGEX = /vimeo\.com\/(?:.*\/)?(\d+)/i;
const INSTAGRAM_REGEX =
  /instagram\.com\/(?:reel|p|tv|stories)\/([A-Za-z0-9_-]+)/i;

export function detectVideoProvider(url: string): VideoProvider {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      return "youtube";
    }
    if (host.includes("vimeo.com")) {
      return "vimeo";
    }
    if (host.includes("instagram.com")) {
      return "instagram";
    }
  } catch (error) {
    console.warn("Unable to parse video URL", url, error);
  }
  return "unknown";
}

export function getVideoEmbed(video: VideoItem): VideoEmbed | null {
  const provider = video.provider ?? detectVideoProvider(video.url);
  switch (provider) {
    case "youtube": {
      const id = extractYouTubeId(video.url);
      if (!id) return null;
      const search = new URLSearchParams();
      if (video.autoplay) search.set("autoplay", "1");
      if (video.loop) {
        search.set("loop", "1");
        search.set("playlist", id);
      }
      const query = search.toString();
      return {
        provider,
        iframe: {
          src: `https://www.youtube.com/embed/${id}${query ? `?${query}` : ""}`,
          title: video.label,
          allow: YOUTUBE_ALLOW,
          allowFullscreen: true,
        },
      };
    }
    case "vimeo": {
      const id = extractVimeoId(video.url);
      if (!id) return null;
      const params = new URLSearchParams();
      if (video.autoplay) params.set("autoplay", "1");
      if (video.loop) params.set("loop", "1");
      const query = params.toString();
      return {
        provider,
        iframe: {
          src: `https://player.vimeo.com/video/${id}${
            query ? `?${query}` : ""
          }`,
          title: video.label,
          allow: VIMEO_ALLOW,
          allowFullscreen: true,
        },
      };
    }
    case "instagram": {
      const id = extractInstagramId(video.url);
      if (!id) return null;
      const embedUrl = `https://www.instagram.com/reel/${id}/embed`;
      return {
        provider,
        iframe: {
          src: embedUrl,
          title: video.label,
          allow: "encrypted-media; picture-in-picture",
          allowFullscreen: true,
        },
      };
    }
    default:
      return null;
  }
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  if (match?.[1]) return match[1];
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length) {
      return pathSegments[pathSegments.length - 1];
    }
  } catch (error) {
    console.warn("Unable to parse YouTube URL", url, error);
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(VIMEO_REGEX);
  if (match?.[1]) return match[1];
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const candidate = parts.pop();
    if (candidate && /^\d+$/.test(candidate)) {
      return candidate;
    }
  } catch (error) {
    console.warn("Unable to parse Vimeo URL", url, error);
  }
  return null;
}

function extractInstagramId(url: string): string | null {
  const match = url.match(INSTAGRAM_REGEX);
  if (match?.[1]) return match[1];
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return parts[1];
    }
  } catch (error) {
    console.warn("Unable to parse Instagram URL", url, error);
  }
  return null;
}

