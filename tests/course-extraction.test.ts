import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CourseExtractionError, extractCourseFile, getCourseFileKind, parseYouTubeVideoId } from "@/lib/server/course-extraction";
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

  it("accepts a browser multipart upload through the extraction route", async () => {
    const form = new FormData();
    form.set("file", new File(["A short course outline."], "outline.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/extract-course", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ title: "outline", text: "A short course outline." });
  });
});
