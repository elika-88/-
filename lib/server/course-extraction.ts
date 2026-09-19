import "server-only";
import { normalizeLectureText } from "@/lib/input";

export const COURSE_FILE_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxCharacters: 60_000,
} as const;

export type SupportedCourseFile = "pdf" | "pptx" | "docx" | "text";
export type ExtractedCourse = { title: string; text: string; sourceLabel: string };

const YOUTUBE_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const YOUTUBE_ANDROID_VERSION = "20.10.38";
const YOUTUBE_ANDROID_AGENT = `com.google.android.youtube/${YOUTUBE_ANDROID_VERSION} (Linux; U; Android 15) gzip`;
const YOUTUBE_PLAYER_CLIENTS = [
  {
    name: "ANDROID",
    version: YOUTUBE_ANDROID_VERSION,
    userAgent: YOUTUBE_ANDROID_AGENT,
    details: { androidSdkVersion: 35 },
  },
  {
    name: "IOS",
    version: "20.10.4",
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)",
    details: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.1.22D72" },
  },
] as const;
const YOUTUBE_CAPTION_ENDPOINTS = [
  { hostname: "www.youtube.com" },
  { hostname: "www.youtube-nocookie.com" },
  { hostname: "m.youtube.com" },
  { hostname: "kids.youtube.com" },
  { hostname: "video.google.com", pathname: "/timedtext" },
] as const;

export class CourseExtractionError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415 | 422 | 502,
    message: string,
  ) {
    super(message);
  }
}

const extensionKinds: Record<string, SupportedCourseFile> = {
  pdf: "pdf",
  pptx: "pptx",
  docx: "docx",
  txt: "text",
  md: "text",
  markdown: "text",
};

function cleanText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n[\t ]*\n[\t \n]*/g, "\n\n")
    .trim();
}

function ensureUsableText(text: string, sourceLabel: string) {
  const cleaned = cleanText(text);
  if (!cleaned) throw new CourseExtractionError(422, `No readable text was found in ${sourceLabel}. Scanned files need OCR before they can be used.`);
  if (cleaned.length > COURSE_FILE_LIMITS.maxCharacters) {
    throw new CourseExtractionError(413, `The extracted text exceeds ${COURSE_FILE_LIMITS.maxCharacters.toLocaleString()} characters. Split the course into smaller files.`);
  }
  return cleaned;
}

export function getCourseFileKind(filename: string): SupportedCourseFile {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (extension === "ppt") {
    throw new CourseExtractionError(415, "Legacy .ppt files are not supported. Save the presentation as .pptx and upload it again.");
  }
  const kind = extensionKinds[extension];
  if (!kind) throw new CourseExtractionError(415, "Supported files: PDF, PPTX, DOCX, TXT, and Markdown.");
  return kind;
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "Imported course";
}

function xmlText(xml: string) {
  return xml
    .replace(/<a:br\s*\/?>(?:<\/a:br>)?/g, "\n")
    .replace(/<a:p\b[^>]*>/g, "")
    .replace(/<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function extractPptx(buffer: Buffer) {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(buffer, { createFolders: false });
  const slides = Object.entries(archive.files)
    .filter(([path, entry]) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort(([a], [b]) => Number(a.match(/slide(\d+)\.xml/i)?.[1]) - Number(b.match(/slide(\d+)\.xml/i)?.[1]));
  if (!slides.length) throw new CourseExtractionError(422, "This PPTX file does not contain readable slides.");
  if (slides.length > 500) throw new CourseExtractionError(413, "Presentations must contain 500 slides or fewer.");
  const contents = await Promise.all(slides.map(async ([, slide], index) => {
    const text = xmlText(await slide.async("text"));
    return text.trim() ? `Slide ${index + 1}\n${text.trim()}` : "";
  }));
  return contents.filter(Boolean).join("\n\n");
}

export async function extractCourseFile(file: File): Promise<ExtractedCourse> {
  if (!file.name) throw new CourseExtractionError(400, "Choose a course file to upload.");
  if (file.size === 0) throw new CourseExtractionError(400, "The selected file is empty.");
  if (file.size > COURSE_FILE_LIMITS.maxBytes) throw new CourseExtractionError(413, "Files must be 15 MB or smaller.");

  const kind = getCourseFileKind(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    let text: string;
    if (kind === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try { text = (await parser.getText()).text; }
      finally { await parser.destroy(); }
    } else if (kind === "pptx") {
      text = await extractPptx(buffer);
    } else if (kind === "docx") {
      const { default: mammoth } = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    }
    return { title: titleFromFilename(file.name), text: ensureUsableText(text, file.name), sourceLabel: file.name };
  } catch (error) {
    if (error instanceof CourseExtractionError) throw error;
    throw new CourseExtractionError(422, `Could not read ${file.name}. Make sure it is a valid, unprotected ${kind.toUpperCase()} file.`);
  }
}

export function parseYouTubeVideoId(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new CourseExtractionError(400, "Paste a valid YouTube video link."); }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId: string | null = null;
  if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    else if (/^\/(?:shorts|embed|live)\//.test(url.pathname)) videoId = url.pathname.split("/")[2] ?? null;
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new CourseExtractionError(400, "Paste a standard YouTube watch, short, embed, live, or youtu.be link.");
  return videoId;
}

function decodeXmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

export function parseYouTubeCaptionXml(xml: string) {
  const paragraphs = [...xml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => decodeXmlText(match[1]).trim())
    .filter(Boolean);
  if (paragraphs.length) return paragraphs.join(" ");
  return [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) => decodeXmlText(match[1]).trim())
    .filter(Boolean)
    .join(" ");
}

function collapseRepeatedWordGroups(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (let index = 0; index < words.length;) {
    let repeatedLength = 0;
    const maxLength = Math.min(80, Math.floor((words.length - index) / 2));
    for (let length = maxLength; length >= 3; length -= 1) {
      if (words.slice(index, index + length).every((word, offset) => word === words[index + length + offset])) {
        repeatedLength = length;
        break;
      }
    }
    if (!repeatedLength) {
      result.push(words[index]);
      index += 1;
      continue;
    }
    result.push(...words.slice(index, index + repeatedLength));
    index += repeatedLength;
    while (
      index + repeatedLength <= words.length
      && words.slice(index, index + repeatedLength).every((word, offset) => word === result[result.length - repeatedLength + offset])
    ) index += repeatedLength;
  }
  return result.join(" ");
}

export function parseYouTubeTranscriptMarkdown(markdown: string, videoId: string) {
  const title = markdown.match(/^# Transcript:\s*(.+)$/m)?.[1]?.trim() || `YouTube video ${videoId}`;
  const transcript = markdown.split(/^## Transcript\s*$/m)[1];
  if (!transcript) throw new Error("Transcript section is missing.");
  const text = transcript
    .split(/\n{2,}/)
    .map((paragraph) => collapseRepeatedWordGroups(normalizeLectureText(paragraph.trim().replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, ""))))
    .filter(Boolean)
    .join("\n\n");
  if (!text) throw new Error("Transcript is empty.");
  return { title, text };
}

async function fetchPublicYouTubeTranscript(videoId: string) {
  const response = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
    headers: { Accept: "text/markdown,text/plain;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) throw new Error("Transcript response is too large.");
  const markdown = await response.text();
  if (!response.ok || markdown.length > 2 * 1024 * 1024) throw new Error("Public transcript request failed.");
  return parseYouTubeTranscriptMarkdown(markdown, videoId);
}

export function getYouTubeCaptionUrls(baseUrl: string) {
  const captionUrl = new URL(baseUrl);
  if (captionUrl.protocol !== "https:" || !(captionUrl.hostname === "youtube.com" || captionUrl.hostname.endsWith(".youtube.com"))) {
    throw new Error("Invalid YouTube caption URL.");
  }
  captionUrl.searchParams.set("fmt", "srv3");

  return YOUTUBE_CAPTION_ENDPOINTS.map(({ hostname, ...endpoint }) => {
    const candidate = new URL(captionUrl);
    candidate.hostname = hostname;
    if ("pathname" in endpoint) candidate.pathname = endpoint.pathname;
    return candidate;
  }).filter((candidate, index, candidates) => candidates.findIndex((other) => other.href === candidate.href) === index);
}

async function fetchYouTubePlayerTranscript(videoId: string) {
  type PlayerData = {
    videoDetails?: { title?: unknown };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ baseUrl?: unknown }> } };
  };

  let title = `YouTube video ${videoId}`;
  let baseUrl: unknown;
  for (const client of YOUTUBE_PLAYER_CLIENTS) {
    const playerResponse = await fetch(YOUTUBE_PLAYER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": client.userAgent },
      body: JSON.stringify({
        context: { client: { clientName: client.name, clientVersion: client.version, ...client.details, hl: "en", gl: "US" } },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!playerResponse.ok) continue;
    const data = await playerResponse.json() as PlayerData;
    if (typeof data.videoDetails?.title === "string") title = data.videoDetails.title;
    baseUrl = data.captions?.playerCaptionsTracklistRenderer?.captionTracks?.find((track) => typeof track.baseUrl === "string")?.baseUrl;
    if (typeof baseUrl === "string") break;
  }

  if (typeof baseUrl !== "string") throw new Error("YouTube captions are unavailable.");

  for (const captionUrl of getYouTubeCaptionUrls(baseUrl)) {
    try {
      const captionResponse = await fetch(captionUrl, {
        headers: {
          "User-Agent": YOUTUBE_ANDROID_AGENT,
          Referer: "https://www.youtube.com/",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await captionResponse.text();
      if (!captionResponse.ok) continue;
      const text = parseYouTubeCaptionXml(body);
      if (text) return { title, text };
    } catch {
      // A YouTube edge may reject or time out in some hosting regions; try the next official host.
    }
  }

  throw new Error("YouTube caption request failed.");
}

export async function extractYouTubeTranscript(sourceUrl: string): Promise<ExtractedCourse> {
  const videoId = parseYouTubeVideoId(sourceUrl.trim());
  try {
    const transcript = await fetchYouTubePlayerTranscript(videoId);
    return { title: transcript.title.slice(0, 200), text: ensureUsableText(transcript.text, "this YouTube video"), sourceLabel: "YouTube captions" };
  } catch {
    try {
      const transcript = await fetchPublicYouTubeTranscript(videoId);
      return { title: transcript.title.slice(0, 200), text: ensureUsableText(transcript.text, "this YouTube video"), sourceLabel: "YouTube transcript" };
    } catch {}
    try {
      const { fetchTranscript } = await import("youtube-transcript");
      const transcript = await fetchTranscript(videoId, { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) });
      const text = ensureUsableText(transcript.map((item) => item.text).join(" "), "this YouTube video");
      return { title: `YouTube video ${videoId}`, text, sourceLabel: "YouTube captions" };
    } catch (error) {
      if (error instanceof CourseExtractionError) throw error;
      throw new CourseExtractionError(422, "YouTube captions could not be retrieved. Check that the video is public and has captions, then try again.");
    }
  }
}
