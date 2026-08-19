# CLAUDE.md

This file provides context and instructions for AI coding agents working on CAI.

Read `README.md` before making substantial changes.

## What CAI is

CAI (Cybernetic AI) is an experiment in creating a closed feedback loop between human cognition and AI.

The current experiment uses Excalidraw files as an observable trace of human thought.

CAI watches those files and records snapshots over time. Those snapshots can eventually be transformed into a timeline of micro-deltas representing how the user's externalized thinking evolved.

The important object is therefore not merely the current document.

It is the **trajectory**:

```text
human activity
    ↓
observable trace
    ↓
temporal interpretation
    ↓
AI intervention
    ↓
subsequent human activity
```

The long-term goal is to investigate useful cybernetic feedback loops between the human and the model.

## Product principle: augment, don't replace

CAI should improve the quality of the user's cognition rather than silently outsourcing that cognition to the model.

Think of the AI more like a formidable chess coach watching the player's moves than an engine grabbing the pieces and playing the game itself.

Useful interventions might include:

* identifying premature conclusions;
* noticing unexamined assumptions;
* detecting goal drift;
* identifying repeated or circular reasoning;
* introducing a useful mental model;
* noticing work that could be automated;
* recognizing when the user appears stuck;
* rewarding unusually deliberate or effective reasoning.

But intervention itself has a cost.

An AI that constantly comments, interrupts, suggests, explains, or asks questions can easily make the user think worse.

Therefore:

**The intervention must justify the interruption.**

This calibration problem is central to CAI.

## Excalidraw is instrumentation

Do not assume that CAI is fundamentally an Excalidraw application.

Excalidraw is currently the easiest way to obtain a structured, evolving external trace of thought.

The current implementation:

1. watches a target directory;
2. detects changes to `.excalidraw` files;
3. creates a `.snapshots` directory;
4. copies changed files there using timestamped filenames.

This is intentionally primitive.

The filesystem is currently acting as a simple event history.

Do not replace it merely because a database, event store, daemon, service, or more elaborate architecture would look cleaner.

Replace it when actual requirements make the replacement useful.

## Current objective

The immediate objective is to reach the smallest end-to-end system that demonstrates genuine utility.

Conceptually:

```text
observe
  ↓
derive useful temporal context
  ↓
let a model interpret it
  ↓
produce a well-calibrated intervention
  ↓
observe what happens next
```

Call this the **minimum useful closed loop**.

Prioritize work that moves CAI toward testing this loop with a real human.

Infrastructure that does not help test the loop should be treated skeptically.

## Engineering philosophy

CAI is an early experiment.

Do not prematurely turn it into a generalized platform.

Prefer:

* simple implementations;
* small modules with obvious responsibilities;
* experiments that can be run immediately;
* reversible architectural decisions;
* real observed requirements;
* deleting code when an experiment fails.

Avoid without a demonstrated need:

* elaborate abstraction layers;
* dependency injection frameworks;
* generalized plugin systems;
* distributed architecture;
* event buses;
* databases;
* premature schemas;
* factories wrapping trivial construction;
* interfaces with only one implementation;
* configuration systems for hypothetical users;
* infrastructure designed for imagined scale.

Before introducing significant architecture, ask:

> What current problem does this solve?

If the answer depends mostly on hypothetical future requirements, don't build it yet.

## Preserve experimental velocity

The codebase should remain easy to understand.

A new coding agent should ideally be able to inspect the repository and understand the current system in minutes.

When choosing between:

```text
clever + extensible + abstract
```

and:

```text
boring + explicit + easy to replace
```

prefer the second unless the first solves a concrete current problem.

CAI will probably change substantially as experiments reveal what is actually useful.

Optimize for learning.

## Do not confuse activity with progress

This project is particularly vulnerable to interesting technical rabbit holes.

A technically impressive implementation can still be negative progress if it delays testing whether the underlying feedback loop is useful.

When proposing or implementing work, keep the current experiment in view.

Ask:

> Does this get us closer to observing a real cognitive trajectory and producing a useful intervention?

If not, there should be a good reason for doing it now.

## Runtime and tooling

CAI currently uses:

* TypeScript;
* Bun;
* `chokidar` for filesystem watching.

Use Bun by default.

Common commands:

```bash
bun install
bun run src/snapshot.ts <directory>   # watch a directory and record snapshots
bun run src/delta.ts <directory>      # print the trajectory from that directory's .snapshots
bunx tsc --noEmit                     # typecheck (tsconfig is noEmit; there is no build step)
bun test                              # run tests
bun test src/delta.test.ts            # run a single test file
```

Run these from the repo root; the path argument is the directory being watched (the parent of `.snapshots`), not the snapshots directory itself.

There is no lint step, no build step, and no `bin`/`start` script in `package.json`.

Prefer Bun APIs where they materially simplify the implementation, but do not rewrite working code merely to make it more Bun-specific.

Do not add dependencies casually.

For small functionality, first consider whether the standard library or Bun already provides what is needed.

## Code style

Keep the code straightforward and explicit.

Prefer:

* descriptive names;
* small functions;
* shallow control flow;
* types that clarify actual domain concepts;
* comments explaining non-obvious intent rather than restating code.

Avoid introducing abstractions until repetition or domain understanding makes their shape obvious.

When changing behavior, add tests where they provide meaningful protection against regression.

Do not add tests merely to inflate coverage.

## Working with the user

The user is actively discovering what CAI should become.

Treat product ideas as hypotheses, not settled requirements.

When a request has important architectural implications, surface the trade-off rather than silently making a large design decision.

When appropriate, challenge unnecessary complexity.

If a simpler implementation can test the same hypothesis faster, point that out.

Likewise, don't reflexively resist complexity when evidence shows it has become necessary.

The objective is not minimal code.

The objective is maximum learning per unit of implementation effort.

## Keep documentation truthful

Update documentation when the implementation meaningfully changes.

Clearly distinguish between:

* what CAI does today;
* what is being built next;
* speculative future possibilities.

Do not document planned architecture as though it already exists.

CAI's README should remain understandable to someone encountering the project for the first time.

This file should remain useful to an AI coding agent entering the repository with no prior conversation context.

## Current repository

At the time this file was written, the implementation is intentionally tiny.

Two programs, each runnable on its own, plus two helper modules:

* `src/snapshot.ts` — parse one CLI argument, ensure `<target>/.snapshots` exists, then `chokidar.watch(target).on("change")` copies any changed `.excalidraw` file into it.
* `src/delta.ts` — read `<target>/.snapshots` in timestamp order, print an opening scene, then describe each transition.
* `src/scene.ts` — geometry, colour naming and element naming for a single scene. Pure functions over elements.
* `src/text.ts` — describing text changes without spending the context window on the text.

The two programs communicate only through the filesystem. There is no shared state, no schema and no runtime coupling.

Properties that are load-bearing and not obvious from reading a single line:

* **Snapshot filenames are `<epochMillis>.<name>.<ext>`, timestamp first.** This makes lexical order equal chronological order, so a plain directory listing is already the timeline. `delta.ts` parses the timestamp back out of the prefix, so keep it leading.
* **`.snapshots` lives inside the watched tree and is not excluded, yet does not feed back on itself.** Only `change` events are handled; each snapshot is written once, which fires `add`. Handling `add` or `all` — or ignoring the timestamp collision that makes two snapshots in the same millisecond overwrite each other — reintroduces a copy loop. Exclude `.snapshots` explicitly before broadening the event set.
* **The target directory must already exist.** `mkdirSync` is non-recursive, so a missing target throws `ENOENT` rather than reporting a usable error.
* **Excalidraw element `id`s are stable across saves**, which is what makes deltas a keyed comparison rather than a text diff. This is the reason the trace is worth keeping as JSON rather than exported SVG.

### Reading deltas honestly

`delta.ts` exists to describe *acts*, not field changes. Every filter in it was derived from real snapshots, and removing one reintroduces noise that drowns the signal:

* `version`, `versionNonce`, `updated`, `seed` and `index` change on almost every save and mean nothing. `index` in particular is fractional z-order bookkeeping that churns whenever anything is grouped.
* Editing text auto-resizes its box, so a `width` change accompanying a text edit is an artifact rather than a resize the user performed.
* Transitions with no significant events are skipped, and gaps over 30 minutes are marked as session breaks. Pauses and reversals are signal, not noise to be smoothed away.

**A shape can be named two different ways, and both occur in real files.** Excalidraw binds a label inside a shape via `containerId`, but a user can equally type a caption underneath and group the two. Either way the text is that shape's *name*, not an idea of its own, so it is described as the shape and does not report its own move, resize or grouping. A caption only names the shape it sits closest to; other members of the same group are reported as `(in "Name")`, because calling them by that name would assert something the file does not say.

### Arrangement is meaning

On a whiteboard, placement *is* semantics: what sits inside what, what touches, what lines up, what an arrow joins. None of that is stated in the file, so `scene.ts` derives it and `delta.ts` reports what changed. Saying "moved rectangle" without saying where destroys most of the available signal.

Constraints that keep this useful rather than overwhelming:

* Relations are computed **only for elements the user touched**, so output is proportional to the edit and not to the size of the board.
* **One relation per pair**, strongest first (`inside` > `contains` > `overlaps` > `near` > `aligned`). Three per element.
* **Containment and overlap are geometric facts that grouping does not change.** Suppressing same-group pairs wholesale made grouping a box with its contents report "no longer contains", which was simply false. Only *proximity* between group members is suppressed.
* **Alignment is nearly worthless on a snapped grid** — in a tidy diagram everything aligns with everything. It is reported at most once per element, and only when a move established it.
* A caption is not an independent object, so proximity to one is never reported; the shape it names is reported instead.

### Long text

Whiteboards can hold paragraphs, and sending each version whole would cost more than the trace is worth. `text.ts` sends the *edit*, not the document:

* text appears with an **envelope** — head, tail and `[N chars, N words, N lines]`;
* a change is described by trimming the common prefix and suffix to isolate the changed span, classified as `appended`, `prepended`, `cut`, `rewrote` or `revised N% in`. Real edits are one contiguous span, so this is cheap and usually exact;
* anything too long is cut to a budget and marked `…[+N chars]`. **Elision is always marked** — the header explains how to read the full text back out of the snapshot by element id. Never silently truncate, and never lossily summarise: the discarded part is exactly what we might be looking for;
* every wording is digested, so returning to text abandoned earlier reports `restored wording from step N`. Reversion is one of the few directly observable signs of circular reasoning.

`src/delta.test.ts`, `src/scene.test.ts` and `src/text.test.ts` pin these rules. If a change to the vocabulary makes them fail, the question to ask is whether the timeline still describes what a human would say they did.

Do not infer architectural requirements from the size of the idea.

Start from the size of the current experiment.
