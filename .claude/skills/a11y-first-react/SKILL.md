---
name: a11y-first-react
description: Accessibility and component rules for the LeaveBoard React client. Load at the start of every frontend session, and before writing any component, page, or CSS.
---

# Accessibility is the definition of done

A page is not finished when it renders. It is finished when its `jest-axe` test passes with
zero violations and it is fully operable with the keyboard alone. Section 4 of
`docs/DESIGN.md` is the full list; this is how to satisfy it.

## Every page

- Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`. Exactly one `<h1>`. Headings descend
  without skipping a level.
- A skip link to `<main>` as the first focusable element. Visually hidden until focused,
  never `display: none` (that removes it from the tab order entirely).
- `<title>`-equivalent: set a document title per route so screen reader users know where
  they landed after navigation.
- Move focus to the `<h1>` (or a heading with `tabIndex={-1}`) after a route change.
  React Router does not do this and the omission strands screen reader users on the old page.

## Focus

Never `outline: none` without an equally visible replacement. Use `:focus-visible` and a
token-driven ring:

```css
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
```

After any async action, focus must land somewhere sensible: the success message, the
refreshed list, or back on the trigger. Focus that falls to `<body>` is a bug.

## Forms

Every input has a real `<label for>`. Placeholder text is not a label and never a
substitute for one.

```jsx
<Field
  id="startDate"
  label="Start date"
  error={errors.startDate}
  hint="Weekends and public holidays are not counted"
/>
```

`Field` wires this up and every form input goes through it:

- `<label htmlFor={id}>`
- `aria-describedby` pointing at the hint id, the error id, or both, space-separated
- `aria-invalid="true"` only when the field actually has an error
- The error node rendered next to the input, not in a summary far away

On submit with errors: render them, then move focus to the first invalid field. Announce a
summary through the live region. Do not rely on the browser's native validation bubbles —
they are inconsistent and not reliably announced.

## Live regions

One shared `<LiveRegion>` with `aria-live="polite"`, mounted once in the app shell, fed
through a hook. Use it for the business-day readout, submit success, cancellations, and
approve/deny decisions.

Rules that make it actually work:

- The region must be in the DOM **before** the text changes. Mounting a filled region
  announces nothing in most screen readers.
- Announce the meaningful sentence, not the raw number: `This request uses 4 business days`.
- Debounce the business-day readout (about 400ms) so typing a date does not fire a stream
  of announcements. Debounce the announcement, not just the fetch.
- `aria-live="polite"`, never `assertive`, for anything that is not an error interrupting
  the user.

## Dialogs

Used for cancel confirmation and the approve/deny decision. The `Dialog` component must:

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its heading
- Trap focus inside while open, cycling at both ends with Tab and Shift+Tab
- Move focus to the dialog (its heading or first control) on open
- Close on `Esc`
- Return focus to the element that opened it on close, always, including after the action
  succeeds and the underlying list re-renders

Test each of those behaviors. A dialog that traps focus but never returns it is worse than
no dialog.

## Status and color

Status is never conveyed by color alone. Every status carries an icon or text label
alongside the color. Contrast: 4.5:1 for text, 3:1 for UI boundaries and icons. Check the
tokens, not just the rendered screenshot.

## Responsive

Mobile-first. Breakpoints at 640px and 1024px, written as `min-width` queries. No
horizontal scroll at 320px — that is the hard floor, and it is where fixed pixel widths and
wide tables break.

Tables collapse to stacked cards below 640px. `DataTable` owns that: the same data, one
component, a card layout at narrow widths rather than a scroll container. Tap targets are
at least 44x44px.

Respect motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## CSS conventions

Hand-written CSS. No Tailwind, no component library — writing the CSS is part of what this
project demonstrates.

- `styles/tokens.css` holds every color, space, radius, and font size as a custom property.
  Components reference tokens; a raw hex or a magic pixel value in a component file is a
  review comment.
- Co-locate component styles as CSS modules next to the component.
- No inline `style` for layout. Inline style is acceptable only for a genuinely dynamic
  value such as a computed width.
- Use logical, readable class names. This CSS will be read by a hiring team.

## Testing

Every component and page gets React Testing Library tests plus an axe test:

```jsx
it('has no accessibility violations', async () => {
  const { container } = render(<Page />);
  expect(await axe(container)).toHaveNoViolations();
});
```

Query by role and accessible name, in that order of preference:

```jsx
screen.getByRole('button', { name: 'Cancel request' });
screen.getByRole('textbox', { name: 'Start date' });
```

`getByTestId` is a last resort. If you cannot find an element by its role and name, a
screen reader user cannot find it either — that is the test telling you about a real bug.

Drive interactions with `userEvent`, not `fireEvent`, so focus and keyboard behavior are
exercised the way a real user produces them.

## Data

Until the real API merges, `client/src/mocks/` holds MSW handlers matching
`docs/openapi.yaml`. Build against those. After Phase 2.6 the app talks to
`VITE_API_URL` and MSW stays for tests only.

`docs/openapi.yaml` is frozen. If you need a shape it does not describe, run
`gh issue create` and stop that task — do not invent a field or reshape a response in the
client to compensate.

## Before you open the PR

```
npm run lint
npm test --workspace client
```

Then walk the DOM in your head: tab through the feature in order. Is the order sensible?
Does focus go somewhere after every async action? Does it work at 320px?
