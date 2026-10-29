# Polish pass — consistency audit (2026-10-29)

Baseline: `post-redesign-audit.md` (audit 17/20, Nielsen 29/40). Counts are `app/**/*.tsx` before this pass.
Rule of thumb: **one way to do each thing**, and the way lives in `tokens.css` → `tailwind.config.ts`.

| Area | Found | Rule after this pass |
|---|---|---|
| Spacing | On scale; ~30 arbitrary `-[…]` values (panel widths 360px, toolbar offset 6.75rem, min-h 10/20/24rem, `-mb-[2px]`, inset tab shadow) | Repeated geometry becomes a token (`w-panel-agent`, `w-panel-inspector`, `max-w-panel`, `bottom-toolbar`); the rest is an explicit allowlist in `designContract.test.ts` — a new arbitrary value fails the test until it is added on purpose |
| Radii | `rounded-full` 48, `md` 34, `lg` 26, `sm` 8; off-scale: bare `rounded` ×5, `rounded-xl` ×3 (xl = lg = 10px), toast unrounded | `sm` chips/inputs-in-cards · `md` controls · `lg` cards/panels/toasts · `full` pills/avatars. Bare `rounded` and `rounded-xl` banned |
| Borders | width: `border-2` ×28, `border-b-2` ×8, `border-3` ×1; colour: `ink/10` 47, `ink/15` 43, `ink/20` 11, `ink/25` 2 | 1px everywhere. Colours: `border-line` (hairline, ink 12%) for containers/dividers, `border-line-strong` (ink 22%) for dashed drop zones/emphasis, `border-border-strong` for form controls (3:1). 2px only for: active-tab underline, left accent bars, selection, spinners, comic frame |
| Shadows | `shadow-panel` ×11, bare `shadow` ×1, one inset arbitrary shadow (TopBar tab) | `shadow-panel` (floating), `shadow-dialog` (modal); tab underline uses `shadow-tab-active` token |
| Type | xs 229 / sm 65 / md 13 / base 7 / lg 3 / xl 2 / 2xl 1; `text-ink/15…/85` ×14 ad-hoc | Sizes OK (dense tool). Text colours only `ink` / `ink-muted` / `ink-subtle` / `ink-faint` (decorative glyphs); `text-ink/NN` banned |
| Icons | h-3.5 ×42, h-4 ×30, h-3 ×15, h-5 ×9, h-6 ×8; SvgIcon sizes 10–32 incl. 11/13/17/22 | 12 (inline meta) · 14 (dense chrome) · 16 (default) · 20 (prominent) · 24/32 (empty/hero). Heroicons outline 1.5 stroke, solid only for state |
| Focus | Global 2px primary outline + offset; 3× `focus:outline-none` on textareas kill it | Never remove the ring; focused fields also get `border-primary` |
| Hover / active / disabled | hover mixes `paper-200`/`paper-300`/`opacity-80/90`; no pressed state; disabled = opacity-50 via Button | Hover = one step deeper than the resting surface (`paper-100/surface → 200`, `paper-200 → 300`) or border → primary (cards); no opacity hovers on buttons; pressed = 1px nudge on `.btn-doodle` & cards; disabled = opacity-50 + not-allowed |
| Motion | `duration-fast` ×36, no easing token; panels pop in/out instantly; global reduced-motion clamp exists | `ease-standard` token; panels slide in from their side (`animate-enter-left/right`), menus/capsules rise (`animate-enter`), dialogs fade the backdrop and lift/slide the panel; centred pills fade only (`animate-fade-in`, keeps their translate), 150–300ms; reduced-motion keeps clamping everything |
| Loading / empty / error | `animate-spin` ×7 hand-rolled + `spinner-doodle` ×15; images/videos pop in on blank | Spinners = `spinner-doodle`; media gets `media-placeholder` (paper-200 shimmer until `load`, then fade); empty = `EmptyState`; errors = left-accent callout |
| Dark parity | Tokens mirror; alpha-ink borders already theme-safe; `ink/15` icons nearly invisible in dark | All of the above are token-based, so dark follows; recheck screenshots |
| Canvas cards | frame `border-3 rounded-xl`; selection ring only | 1px frame, hover lift (border → strong), selected ring, running = info pulse dot, failed = error accent |

## PRs
1. tokens + guard + this doc (borders/radii/text colour/arbitrary values onto tokens).
2. states & motion: pressed, hover unification, focus fixes, panel/menu transitions.
3. media placeholders (`ui/media.ts`) + canvas card states + icon-size scale (guarded in `designContract.test.ts`).
4. final detect/critique + screenshots (`.devdata/screens/polish-*.png`).

## Results (after #39–#44)

Impeccable detect (`/`, `/projects`, `/project/2`, `/project/5`, `/universes` × 1440 / 1280 / 390): low-contrast 0, undersized 0, hard-offset 0 everywhere. Text-occlusion on the canvas was 11 @1440 (`/project/2`), 14 + 4 @1280 (was 18), 0 on mobile, all from the neighbouring Cast / Final frames under the floating panels. #46 made auto-fit target the whole board (Cast, storyboard, Final), with the open Agent panel and inspector as left/right padding and 168px bottom padding for the toolbar and PromptBar. That brought occlusion to 0 but zoomed out to about 40% at 1440×900, so card text was hard to read. #47 keeps the whole-board fit but clamps auto-fit at the readable zoom 12/13 (13px card titles at about 12px on screen). When clamped it centres the storyboard and lets the side frames be cut off; manual zoom still goes down to 0.2, and re-fit still stops once the user pans or zooms (#38). On the seeded projects the board never fits at readable zoom, so both 1440×900 and 1280×800 land at 92%, and the occlusion counts are back to the pre-#46 level (11 @1440 and 14 + 5 @1280 on `/project/2` + `/project/5`, 0 on mobile). They come from the cut-off side frames and the lower shot row under the floating panels, which is expected.

Audit 17 → 18/20 (implementation 3 → 4: tokens and guards for borders, radii, text tints, arbitrary values and icon sizes). Nielsen 29 → 30/40 (help/docs 2 → 3: How-it-works panel, empty-frame hints, sort-mode hint; the other heuristics stay at 3).

Screens: `.devdata/screens/polish-{desktop,mobile}-{light,dark}.png`.
