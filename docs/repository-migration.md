# Repository Migration

The project was copied from https://github.com/BAITC-Hacks/hack-3dbc6029-ace
to https://github.com/elika-88/- on 2026-09-17 after the original repository
became archived and read-only.

All tracked source files, documentation, test files, dependency locks, workflow
configuration, and reachable Git commits were preserved. Original commit authors
and timestamps remain in Git history. The destination's initial README commit
was retained as a merge parent; the project README is the active documentation.

## Branches

| Destination branch | Content |
| --- | --- |
| main | Latest integrated application and migration documentation |
| elika | Same integrated version at migration time; ongoing development branch |
| xiaomao | Original frontend branch at 924a50a674dd10b12e80e4b230020a47098ebb3f |
| archive-original-main | Original main at 82216f9a3c9d630a40f69870fa4c0fb8c0ec826d |

Local `origin` now points to the destination; `upstream` retains the original URL.
No tags were present in the original repository at migration time.

## Original Pull Request

The original repository had one issue-list entry, a merged pull request. Its
metadata is recorded here, rather than posting a new message as its author.

- Number: 1
- Title: Integrate Lumina frontend and generation backend
- Author: xiaomao8090
- URL: https://github.com/BAITC-Hacks/hack-3dbc6029-ace/pull/1
- State: closed, merged
- Created: 2026-09-17T13:30:40Z
- Merged: 2026-09-17T13:30:55Z
- Head: xiaomao; base: main
- Merge commit: 82216f9a3c9d630a40f69870fa4c0fb8c0ec826d

Original description (historical validation status, not the current app status):

> Integrates the English Lumina study workspace with the lecture generation backend.
>
> Includes local lecture history, validated NDJSON streaming, cancellation and error recovery, four-option quizzes, flashcard review, and source citations. Custom API credentials stay out of saved lecture history. Runtime pages contain no fixture results.
>
> Validation: 107 unit tests, TypeScript checks, and lint passed locally. The local app starts and the generation endpoint returns its configuration error without credentials. Real AI generation has not been validated with a live key. Browser regression tests were updated but not run in this integration turn.
>
> GitHub Actions could not start because the repository account is locked due to a billing issue; no CI test steps executed.

No issue comments, submitted reviews, inline review comments, or releases were
returned by the original repository's API at migration time.

## Local and Hosted State

API keys, `.env.local`, browser-local lecture history, dependencies, temporary
test output, and build artifacts were not uploaded. The environment template is
included. Reinstall dependencies with `npm ci` and configure secrets separately.

GitHub-hosted settings, collaborator permissions, repository secrets, Actions
execution history, and original PR URLs are not Git objects and are not cloned
by this migration. Workflow definitions are included; execution in the new
repository depends on its account settings. No hosted settings or collaborators
were changed as part of the copy.
