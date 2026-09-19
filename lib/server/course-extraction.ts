import "server-only";

import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { fetchTranscript } from "youtube-transcript";

export const COURSE_FILE_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxCharacters: 60_000,
} as const;

export type SupportedCourseFile = "pdf" | "pptx" | "docx" | "text";
export type ExtractedCourse = { title: string; text: string; sourceLabel: string };

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
      const parser = new PDFParse({ data: buffer });
      try { text = (await parser.getText()).text; }
      finally { await parser.destroy(); }
    } else if (kind === "pptx") {
      text = await extractPptx(buffer);
    } else if (kind === "docx") {
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

export async function extractYouTubeTranscript(sourceUrl: string): Promise<ExtractedCourse> {
  const videoId = parseYouTubeVideoId(sourceUrl.trim());
  try {
    const transcript = await fetchTranscript(videoId);
    const text = ensureUsableText(transcript.map((item) => item.text).join(" "), "this YouTube video");
    return { title: `YouTube video ${videoId}`, text, sourceLabel: "YouTube captions" };
  } catch (error) {
    if (error instanceof CourseExtractionError) throw error;
    throw new CourseExtractionError(422, "YouTube captions could not be retrieved. Check that the video is public and has captions, then try again.");
  }
}
