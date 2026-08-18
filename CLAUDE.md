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
2. detects changes to `.excalidraw.svg` files;
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
bun run index.ts <directory>
bun test
```

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

The core behavior lives in `index.ts`.

Do not infer architectural requirements from the size of the idea.

Start from the size of the current experiment.
