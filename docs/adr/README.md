# Architecture decision records

One file per decision that closed off an alternative someone would reasonably expect.
Numbered in the order they were made, and never rewritten after the fact — a decision that
turns out to be wrong gets a new record that supersedes the old one, so the reasoning at
the time stays visible.

Format: context, decision, consequences. The consequences section is the one that earns
the file. Anyone can write down what they chose; the useful part is being honest about
what it cost.

| #                                      | Decision                                          | Status   |
| -------------------------------------- | ------------------------------------------------- | -------- |
| [0001](./0001-no-auth.md)              | No authentication; a seeded user switcher instead | Accepted |
| [0002](./0002-express-over-fastapi.md) | Express for the API rather than FastAPI           | Accepted |
| [0003](./0003-holiday-caching.md)      | Cache public holidays per year in the database    | Accepted |
