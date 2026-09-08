# Accessibility

The target is WCAG 2.1 AA. It is the definition of done for every front-end change in this
project, not a pass at the end: a page is not finished until its automated accessibility
test passes and it can be operated with the keyboard alone.

> **Status:** the automated checks below run in CI today. The manual screen reader pass is
> scheduled for task 3.4 and its results are not yet recorded — the section at the bottom is
> a placeholder until then, and I would rather it say so than imply verification that has not
> happened.

## How it is verified

**Automated, on every pull request.** Every page and shared component has a `jest-axe` test
asserting zero violations, run by `npm test` and again in CI. `eslint-plugin-jsx-a11y` runs
over the client on every lint.

```
npm test
npm run lint
```

Automated tools catch perhaps a third of what matters. They will tell you an input has no
label; they will not tell you the focus order is nonsense or that a dialog dumps you back at
the top of the page. Everything below the tooling section is checked by hand.

**By keyboard.** Unplug the mouse and use the app: Tab, Shift+Tab, Enter, Space, Escape,
arrow keys in the select. Every interactive element must be reachable, every focus position
visible, and focus must land somewhere deliberate after anything asynchronous.

**With a screen reader.** NVDA on Windows, in Firefox. Scheduled for task 3.4.

## What is built in

**Landmarks and headings.** Every page renders inside `header`, `nav`, `main` and `footer`.
Each page has exactly one `h1`, supplied by the shared `Page` component so it cannot be
forgotten or duplicated, and headings descend without skipping a level.

**Skip link.** The first focusable element on the page jumps to `main`. It is positioned off
screen and returns on focus rather than being `display: none`, which would remove it from the
tab order and defeat its purpose.

**Focus after navigation.** React Router leaves focus where it was, which strands a screen
reader user on the page they just left. The app shell moves focus to the new page's heading
on every route change, and deliberately not on first load, where doing so would put the skip
link behind the user before they could reach it.

**Forms.** Every control goes through the shared `Field` component, which pairs a real
`<label for>` with the input, links hint and error text through `aria-describedby`, and sets
`aria-invalid` only when the field is actually invalid. Placeholders are never used as
labels. On submit with errors, focus moves to the first invalid field.

**Announcements.** One `aria-live="polite"` region is mounted in `main` for the whole app and
fed through a hook. It is in the document before its text ever changes, because a region that
appears with its message already in it announces nothing in most screen readers. Announcing
the same sentence twice still speaks, which matters when a user edits a date and the
business-day count lands on the same number. The dashboard announces itself when its data
arrives, because swapping the loading message for the loaded page is otherwise silent to
anyone who is not tabbing through it.

**Dialogs.** `role="dialog"`, `aria-modal="true"`, labelled by their heading. Focus moves in
on open, is trapped in both directions while open, `Escape` closes, and focus returns to the
control that opened it — including when the list behind the dialog has re-rendered, and
including when that control no longer exists. The trap listens on the document rather than on
the dialog, because focus can leave without a keystroke — clicking the backdrop drops it on
the body — and a trap that only hears keys pressed inside the dialog cannot pull it back.

**Colour.** Text meets 4.5:1 and interface boundaries meet 3:1 against the surface they sit
on. Every pair in `tokens.css` was checked numerically rather than by eye. Status is never
carried by colour alone: every badge shows the word as well.

The header sits on a dark red, where the default blue focus ring measures 1.4:1 and is
effectively invisible, so controls inside it use a second ring colour that measures 8.4:1.

**Responsive.** Mobile-first, with breakpoints at 640px and 1024px. No horizontal scroll at
320px. Tables become stacked cards below 640px rather than scrolling sideways — and because
overriding `display` on a row or cell strips its implicit table semantics, those two elements
carry their roles explicitly. Tap targets are at least 44px.

That last claim is measured rather than eyeballed. Every page was rendered at 320, 640, 1024
and 1440 and checked for horizontal overflow, for the table switching between stacked cards
and table rows, and for any control under 44px in either direction. Sixteen combinations: no
overflow at any width, the switch happening exactly at the 640 breakpoint, and one failure —
the header wordmark was a 34px-tall link, the only control in the app that had been left
without the shared minimum height. It now carries it like the rest.

**Motion.** `prefers-reduced-motion: reduce` collapses animation and transition durations.

## Known gaps

Recorded honestly rather than discovered by a reviewer.

- In the stacked table layout, the column name is inserted with CSS generated content while
  the header row remains in the accessibility tree. A screen reader may therefore announce the
  column name twice. The obvious fix, moving the name into a real element and hiding that from
  assistive technology, would leave the cells with no column name at all if the header row has
  lost its association to them — which stacking makes possible, and which I cannot tell without
  listening to it. A name said twice is a smaller problem than a value with no name, so this
  stays as it is until the manual pass says which of the two is actually happening.

## Manual screen reader pass

Not yet performed. Task 3.4 covers NVDA on Windows across every page, and this section will
record what was tested, what was found, and what was changed in response. It is deliberately
empty rather than optimistic.
