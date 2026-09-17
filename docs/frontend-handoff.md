# Frontend Integration

The workspace now uses the Lumina layout, English UI, local lecture history,
and the shared generation contract. The backend files and shared schemas are
unchanged. There are no generated sample results in the application.

## Current API Behavior

The form submits `POST /api/generate` with `title`, `lecture`,
`outputLanguage`, and optional `provider`. Frontend validation uses
`validateGenerationInput` from `lib/input.ts`.

Backend commit `fe98d02` now implements real generation and source verification.
The frontend consumes its NDJSON response directly. Configure an API key through
the page's API settings or the server environment before generating.

## Ready for Backend Events

`lib/client/generationStream.ts` consumes `application/x-ndjson`, buffering
partial lines and UTF-8 characters. Every event is checked against the shared
`GenerationEventSchema`. The stream must keep one run ID, finish with exactly
one result or error, and end after its terminal event. A stage named `complete`
does not substitute for a result.

Malformed or incomplete streams never replace the previous materials.
Cancellation, switching lectures, or starting a new lecture aborts the request;
late callbacks cannot replace the current session. Requests have a client
timeout of 270 seconds, allowing the backend's 240-second limit to finish.
Progress reflects received events only.

`StudyDashboard` renders the shared `StudyKit` directly: overview, summary
sections, key points, four-option questions, explanations, flashcards, evidence,
limitations, and server-provided review counts. The source dialog checks the
returned segment offsets and quote against the returned original text before
highlighting a citation. This is a display check, not a substitute for backend
grounding and verification.

## Local State

`lumina.sessions.v1` stores lecture text, title, output language, selected tab,
and successful materials in localStorage. Sessions can be searched, renamed,
deleted, and reopened. A failed regeneration preserves the previous result;
changed lecture text is explicitly marked when viewing older materials.

Custom API URL, key, and model are kept only in component memory and request
handling. They are not part of the stored session schema. The key clears when
custom mode is disabled, settings are reset, or the page reloads.

Storage failures are visible. Unreadable history is not overwritten. History
from the standalone desktop HTML is on a different browser origin and is not
automatically accessible to the localhost application.

## Development

```bash
npm ci
npm run dev
npm run check
npm run test:e2e
```

The browser tests keep fixture responses in `tests/` only. They also exercise
the real backend's configuration errors. A fixture test passing does not verify
real AI generation, accuracy, or deployment.
