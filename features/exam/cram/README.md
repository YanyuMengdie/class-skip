# Guided exam sprint

`CramWorkspace` owns user-scoped IndexedDB persistence, material selection, extraction checkpoints, cancellation and request accounting. `GuidedSprintPanel` replaces the earlier quiz queue; existing topic and answer records remain in the saved session and can be inspected in the recap.

## Flow

1. Read selected sources and extract/reuse objectives in one action.
2. For each lecture, call the existing reluctant overview outline and plain-language explanation functions. The outline sees the complete PDF, including figures. Save each preparation stage separately, reveal explanation sections on Continue, and keep source-bound follow-ups beside their section.
3. Offer a broad free retelling. Save the submitted draft before requesting feedback. Missing points are unverified, not errors. Hints/source consultation are recorded separately. Skipping is not a completed retelling.
4. Offer delayed recall after intervening lectures, two distinct supplemented objectives, or elapsed time. Defaults (20 minutes for an initial return and a day after a delayed return) are product eligibility rules, not scientifically optimal intervals. Learners may postpone; further study or a later visit makes the action available again.
5. After the first pass, AI proposes at most three source-linked supplements or eligible recalls, with reason, depth and estimated time. Completing a step requests reassessment. Exam/time edits invalidate future steps and reassess on returning from settings. No fixed discipline-specific priority ladder or grade prediction.
6. Scope and recap stay accessible. They show separate reading, immediate-retelling, delayed-retelling and supplement records. Finished, deferred and replaced plans retain their content and drafts.

## Lightweight teaching visuals

- The sprint opts into optional visual metadata on the existing plain-language explanation request. No image generation call, remote images, automatic regeneration of saved lectures, or extra per-diagram AI requests. Other overview callers keep their existing request schema.
- At most three lecture sections include a compact visual; supplements can include one. Scene tiles, labeled flows, parallel branches and comparison tables use local React/CSS and bundled icons. AI chooses only when the source and explanation support the format; it must not invent a causal chain, experiment, graph or data. Prose stays complete without the visual. Existing source-page buttons open the actual PDF for original figures.
- Step-through and row highlighting are local presentation controls; they never imply mastery or change learning progress. Both immediate and delayed recall hide the teaching content by default. Explicitly opening earlier explanations restores their visuals and uses the existing assisted-recall bookkeeping.
- Visual parsing bounds lengths and validates table dimensions/edge labels. Invalid optional visuals are dropped without losing valid prose. Old saved explanations without visuals remain valid. Diagrams and captions retain source qualifications, and original prose qualification checks still apply.

## Data and boundaries

- `CramSession.guided` is additive. Opening an older sprint creates a new guided first pass without fabricating progress from legacy quiz evidence.
- `sprintState.ts` contains spacing eligibility, progress and plan invalidation rules.
- `sprintAI.ts` constrains plan IDs to current included topics and materials. Recall detail IDs must have been supplemented; lecture-wide recall can omit IDs. Estimates must fit a supplied remaining budget. Planner failure leaves previous plans/history intact.
- Text extraction limitations remain visible, especially image/scanned pages. Overview and supplemental explanations use the actual PDF. No source is silently truncated to satisfy request limits.
- Interrupted generation is manually retryable. No AI request is started by a mount effect, background timer or restoration. Timers only record engaged time and refresh eligibility.
- Reading references during an unfinished, unsubmitted recall marks that recall assisted, even when its panel is temporarily closed.

### Clickable terminology

Sprint first-pass explanations, supplements and follow-up answers request a source-context glossary in the same response. `terms` stores exact names, English, aliases and short plain-language meanings. Rendering annotates prose, callouts, tables and lightweight diagrams without changing saved text. Clicking opens an accessible native dialog with no network call. Existing lectures/supplements expose a manual “补充术语释义” action; it reads the PDF and merges metadata only, preserving learning progress, text and drafts. Metadata travels with existing session persistence/backups. Recall keeps all explanations and definitions hidden until references are explicitly opened. This is opt-in for the shared overview generator; other overview/reader callers keep their existing behavior.

### Deleting a sprint

Each history row has a separate Delete button and a confirmation identifying the record and what will be removed. Deletion is queued after pending saves, updates the list only after the IndexedDB transaction commits, and leaves a failed deletion available for retry. The storage operation checks user ownership in the same read/write transaction and treats an already-missing record as deleted. Only the selected sprint snapshot is removed; library PDFs, shared extraction caches, other sprints and other review records are retained.

Terminology dialog browser checks must use `React.StrictMode`, matching `index.tsx`: click both prose and callout terms, let queued native close events run, verify the dialog remains open, then check Escape/button/backdrop closing and focus restoration. Effect-cleanup close events from a previous setup must not dismiss a reopened dialog.
