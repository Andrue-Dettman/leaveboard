## What this changes

<!-- One or two sentences. What does the app do now that it did not do before? -->

## Why

<!-- The reasoning, not a restatement of the diff. Alternatives considered and rejected
     belong here. If this implements a task from docs/DESIGN.md section 6.5, name the row. -->

Task:

## How I verified it

<!-- Commands run, plus anything checked by hand. Keyboard walkthrough, 320px layout,
     screen reader announcement, curl against a seeded database. -->

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm test`

## Checklist

- [ ] Scope is exactly one task; nothing changed outside the directory I own
- [ ] Request and response shapes match `docs/openapi.yaml`; the contract itself is unchanged
- [ ] Tests cover the happy path and every error path named in the task
- [ ] No secrets, no leftover `console.log`, no TODO without a linked issue

### Server changes

- [ ] Input validated with Zod before any query runs
- [ ] Parameterized queries only
- [ ] Error envelope is `{ error: { code, message, fields? } }` with the right status
- [ ] The 403 paths have tests

### Client changes

- [ ] `jest-axe` test added for any new page or component, and passing
- [ ] Every input has a real `<label for>`; errors linked via `aria-describedby`
- [ ] Keyboard reachable throughout; focus visible; focus goes somewhere deliberate after
      async actions
- [ ] Dialogs trap focus, close on `Esc`, and return focus to the trigger
- [ ] Dynamic updates announced through the shared live region
- [ ] Status conveyed by more than color
- [ ] No horizontal scroll at 320px; tables collapse to cards below 640px
- [ ] Colors and spacing come from tokens; no inline styles for layout
