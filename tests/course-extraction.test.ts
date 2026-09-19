import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CourseExtractionError, extractCourseFile, getCourseFileKind, getYouTubeCaptionUrls, parseYouTubeCaptionXml, parseYouTubeVideoId } from "@/lib/server/course-extraction";
import { POST } from "@/app/api/extract-course/route";

describe("course source extraction", () => {
  it("recognizes the supported upload formats and rejects legacy PowerPoint", () => {
    expect(getCourseFileKind("lecture.PDF")).toBe("pdf");
    expect(getCourseFileKind("slides.pptx")).toBe("pptx");
    expect(getCourseFileKind("notes.docx")).toBe("docx");
    expect(getCourseFileKind("outline.md")).toBe("text");
    expect(() => getCourseFileKind("slides.ppt")).toThrow(/\.pptx/);
  });

  it("extracts editable text from a supported text upload", async () => {
    const file = new File(["Course title\n\nFirst concept.\r\n\r\nSecond concept."], "course.txt", { type: "text/plain" });
    await expect(extractCourseFile(file)).resolves.toMatchObject({ title: "course", text: "Course title\n\nFirst concept.\n\nSecond concept." });
  });

  it("accepts only standard YouTube URLs and returns their video IDs", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=4")).toBe("dQw4w9WgXcQ");
    expect(() => parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toThrow(CourseExtractionError);
  });

  it("extracts and decodes text from YouTube caption XML", () => {
    const xml = '<timedtext><body><p t="0" d="1000"><s>Hello &amp; </s><s>world</s></p><p t="1000" d="900">Second &#39;line&#39;</p></body></timedtext>';
    expect(parseYouTubeCaptionXml(xml)).toBe("Hello & world Second 'line'");
  });

  it("preserves signed caption parameters across official YouTube host fallbacks", () => {
    const urls = getYouTubeCaptionUrls("https://www.youtube.com/api/timedtext?v=video123456&expire=1234567890&signature=abc%3D123&fmt=json3");

    expect(urls.map((url) => [url.hostname, url.pathname])).toEqual([
      ["www.youtube.com", "/api/timedtext"],
      ["www.youtube-nocookie.com", "/api/timedtext"],
      ["m.youtube.com", "/api/timedtext"],
      ["kids.youtube.com", "/api/timedtext"],
      ["video.google.com", "/timedtext"],
    ]);
    for (const url of urls) {
      expect(url.protocol).toBe("https:");
      expect(url.searchParams.get("v")).toBe("video123456");
      expect(url.searchParams.get("expire")).toBe("1234567890");
      expect(url.searchParams.get("signature")).toBe("abc=123");
      expect(url.searchParams.get("fmt")).toBe("srv3");
    }
  });

  it("accepts a browser multipart upload through the extraction route", async () => {
    const form = new FormData();
    form.set("file", new File(["A short course outline."], "outline.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/extract-course", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ title: "outline", text: "A short course outline." });
  });

  it("returns JSON for malformed multipart input without loading file parsers", async () => {
    const response = await POST(new Request("http://localhost/api/extract-course", { method: "POST", body: new FormData() }));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: { message: "Choose a course file or paste a YouTube link." } });
  });
});
