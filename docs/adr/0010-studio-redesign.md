# Studio redesign: artwork-first canvas, one approval inbox, React Flow

Status: accepted (2026-10-28). Partially supersedes ADR 0001, 0003 and 0009.
Spec: `docs/specs/frontend-studio-redesign.md`. Plan: `docs/specs/frontend-studio-redesign-plan.md`.
Canvas evaluation: `docs/research/canvas-evaluation.md`.

## Context

An Impeccable audit of the workbench scored 11/20 (Acceptable).

- **P0:** the Settings dialog renders under the Inspector, because the Inspector uses
  `z-corner` 80 and dialogs use `z-modal` 50, with no portal.
- **P1:** the canvas opens at 44–59% zoom, so card text is unreadable.
- **P1:** status contradicts itself — "成片可用" next to an 8% progress bar.
- **P1:** approval actions are split across three regions.
- **P1:** text is 10px in 140 places.
- **P1:** gold-on-cream text is 1.8:1.

Separately, tldraw's licence makes it unusable for a self-hosted open-source app:

- production builds stop rendering after 5 s without a domain-bound key;
- every downstream deployer needs their own key;
- the hobby key is discretionary, watermarked and phones home.

The owner chose direction C: an AI-native creation studio, delivered in phases and governed by KISS.

## Decisions

1. **Canvas: React Flow (`@xyflow/react`, MIT) replaces tldraw.**
   - React Flow is 57 KB gzip; the tldraw vendor chunk is 480 KB.
   - Nodes are plain React components, there is a selection hook, keyboard-focusable nodes and a read-only mode.
   - `buildComicWorkflow`, `layoutComicWorkflow` and their data model stay unchanged; only the renderer changes.
   - Excalidraw, Konva, Fabric and a hand-rolled pan/zoom board were rejected (see the evaluation).
2. **Layout: artwork-first, floating regions.** *Supersedes ADR 0009 decision 1* ("persistent panes, nothing overlays the canvas").
   - The canvas fills the viewport below the TopBar.
   - The Agent panel (Activity | 待处理), the Inspector, the PromptBar and the canvas toolbar float over it.
   - fitView insets account for open panels, so no artwork is hidden.
   - At most two side panels are open at a time; below 1280 px only one is open.
   - The StagePipeline row is removed; its information moves to the status pill and the Activity timeline.
   - ADR 0009 decisions 2–4 are kept: Brief lives in the Inspector, the PromptBar is always visible, and the Inspector opens on select.
3. **One approval surface.** The 待处理 inbox in the Agent panel is the only place with confirm, resume and retry buttons.
   - The PromptBar is the only text input; "提修改意见" puts a gate chip into it.
   - Card-level 通过/重做 buttons move into the Inspector's Generation section.
   - *Supersedes ADR 0003* for "generate/confirm/cancel" placement and "Agent Column conversation". Activity is now a step timeline, not chat.
   - The semantics of selection binding, targeted regenerate and resume/cancel are unchanged.
4. **One status truth.**
   - Every status display reads `deriveStudioStatus`.
   - Progress and stage render only while a run is active.
   - The "待确认" card state appears only under an active gate.
5. **Visual system: professional tool with light comic accents.** *Supersedes the D2 "Dense Comic Workbench" aesthetic and the "not dual themes" line in DESIGN.md.*
   - Light and dark themes both stay; the default follows the system setting.
   - New primary colour 印版品红: `#B0215F` (light), `#F27AAE` (dark). It is AA in both themes.
   - Status colours get text-safe `*-fg` tokens.
   - The type scale has a 12 px floor (`--text-2xs` is deleted).
   - Text uses the system CJK font stack, with no bundled CJK webfont. Bangers is kept for the wordmark only; Fredoka, Nunito and Caveat are removed.
   - Comic accents are limited to four places: the wordmark, the final-video frame, the final-video moment, and empty states.
6. **One primitive per concern.**
   - A single `Dialog` built on native `<dialog>.showModal()`. The browser top layer means no z-index for dialogs. Drawers are a `sheet` variant of it.
   - A single `Button`/`IconButton`.
   - No Radix unless native dialog proves insufficient. In that case add `@radix-ui/react-dialog` only.
   - `--z-corner` is deleted.
7. **Mobile (< 1024 px) is view / approve / download only.** No canvas, no Inspector, no PromptBar.
8. **Deletions:**
   - consistency radar plus `recharts`;
   - creation interview, including the backend `POST /text/interview/next`;
   - SkillWall and skillCatalog;
   - Caveat, Fredoka and Nunito;
   - StagePipeline;
   - chat speech bubbles and TypewriterText;
   - tldraw.

## Consequences

- ADR 0001's batch-delivery rule still applies: every phase is a series of small, independently mergeable PRs.
  ADR 0001 and ADR 0003's interaction freeze is lifted only for the items listed in decision 3.
- ADR 0002 (tokens.css is the SSOT) still applies. The DESIGN.md front-matter is updated in the same PR that changes tokens (Phase 1).
- ADR 0007 (TanStack Query owns server state) still applies. No new state library is added.
- New dependency: `@xyflow/react` (MIT).
- Removed dependencies: `tldraw`, `recharts`, `@fontsource/caveat`, `@fontsource/fredoka`, `@fontsource/nunito`.
- Accepted risk: jsdom lacks `HTMLDialogElement.showModal`, so tests need a small polyfill in `setupTests.ts`.
