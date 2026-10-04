# Course file imports

The workspace accepts text-based PDF, PPTX, DOCX, UTF-8/UTF-16 TXT, and Markdown files. The picker and drag-and-drop use the same import path. After importing, review the extracted text and choose **Generate materials**.

Uploads are limited to **4 MiB per file** on both client and server, leaving room for multipart metadata under the [Vercel Function 4.5 MB payload limit](https://vercel.com/docs/functions/limitations#request-body-size). The previous 15 MiB label allowed requests the production host would reject before the extraction handler ran. Larger files must be split or compressed, or their text pasted into the workspace. Supporting larger binary uploads requires a separate direct-to-storage upload flow.

The PDF parser runs in Node.js. `next.config.ts` keeps `pdf-parse` and its native canvas dependency external, and the extraction code loads its Node polyfills and embedded worker before parsing. This follows the [parser's serverless guidance](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/troubleshooting.md). Page-number markers are excluded so an image-only PDF cannot pass the readable-text check using only generated page labels.

Legacy `.ppt` files require saving as `.pptx`. Scanned/image-only documents need OCR first; this application does not currently run OCR. Protected or damaged documents produce an explicit error. Extracted content remains subject to the generation input limits (60,000 characters, and the existing minimum content requirements).

Regression coverage includes real PDF/PPTX/DOCX parsing, UTF-16 text, MIME-based format detection, empty PDFs, corrupt files, size limits, and desktop/mobile upload-to-result browser flows. Browser tests use the real extraction endpoint and mock AI responses, so they do not verify live model output or production deployment.
