export type VideoProvider = "youtube" | "vimeo" | "instagram" | "unknown";

export interface VideoItem {
  /**
   * Human-friendly label for toggles and iframe titles.
   */
  title: string;
  url: string;
  description: { credits: string; details?: string };
}

export interface VideoGroup {
  label: string;
  date: string;
  videos: VideoItem[];
}

export interface VideoEmbed {
  provider: VideoProvider;
  iframe?: {
    src: string;
    title: string;
  };
  html?: string;
}

const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
const VIMEO_ALLOW =
  "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share";

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
  const provider = detectVideoProvider(video.url);
  switch (provider) {
    case "youtube": {
      const id = extractYouTubeId(video.url);
      if (!id) return null;
      return {
        provider,
        iframe: {
          src: `https://www.youtube.com/embed/${id}`,
          title: video.title,
        },
      };
    }
    case "vimeo": {
      const parsed = extractVimeoDetails(video.url);
      if (!parsed) return null;
      const { id, hash } = parsed;
      const hashSuffix = hash ? `?h=${hash}` : "";
      return {
        provider,
        iframe: {
          src: `https://player.vimeo.com/video/${id}${hashSuffix}`,
          title: video.title,
        },
      };
    }
    case "instagram": {
      const id = extractInstagramId(video.url);
      if (!id) return null;
      const embedUrl = `https://www.instagram.com/p/${id}/embed`;
      return {
        provider,
        iframe: {
          src: embedUrl,
          title: video.title,
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

function extractVimeoDetails(
  url: string,
): { id: string; hash?: string } | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    // First numeric segment is the ID
    const id = parts.find((part) => /^\d+$/.test(part));
    // Second segment (if alphanumeric and not the id) is often the hash
    const hash =
      parts.find((part) => /^[a-zA-Z0-9]+$/.test(part) && part !== id) ??
      undefined;

    // Prefer explicit h query param if present
    const hParam = parsed.searchParams.get("h");
    const finalHash = hParam ?? hash;

    if (!id) return null;
    return { id, hash: finalHash };
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