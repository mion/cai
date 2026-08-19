# CAI — Cybernetic AI

> Merge with superintelligence.

CAI is an experiment in building a closed feedback loop between human thought and AI.

The basic idea is simple: instead of giving an AI only the final result of your thinking, give it a trace of how your thinking evolved over time.

CAI currently uses Excalidraw as the first source of that trace.

Imagine you use an Excalidraw file as a persistent whiteboard:

```text
~/universe/
    whiteboard.excalidraw
```

As you think, you add things, delete things, reorganize ideas, explore alternatives, abandon branches, revise assumptions, and eventually make decisions.

CAI observes those changes by taking snapshots of the file over time.

From those snapshots, it can construct a timeline of micro-deltas representing the evolution of the whiteboard.

The interesting input to the AI is therefore not merely:

```text
current state
```

but:

```text
previous states
    +
changes over time
    +
current state
```

In other words:

**the trajectory of cognition.**

A final whiteboard tells an AI what you think.

Its history can provide evidence about how you arrived there.

## Why?

Most AI interfaces operate roughly like this:

```text
human asks question
        ↓
AI produces answer
        ↓
human consumes answer
```

CAI is exploring something different:

```text
human acts / thinks
        ↓
observable trace
        ↓
AI interprets the trajectory
        ↓
selective intervention
        ↓
human continues acting / thinking
        ↺
```

The goal is not simply to have an AI that answers questions.

The goal is to investigate what becomes possible when an AI can observe enough of a person's ongoing cognitive process to provide useful feedback at the right moment.

The AI should ideally behave less like an oracle and more like a formidable trainer or collaborator.

## What could this enable?

### AI as trainer

An AI observing the trajectory rather than only the result may be able to notice things such as:

* Are you thinking deeply and deliberately, or merely producing activity?
* Are you jumping to a solution before understanding the problem?
* Are you repeatedly exploring alternatives without committing?
* Are you working toward your stated intent, or has your behavior drifted toward something else?
* Are you relying on an assumption that appears likely to lead you astray?
* Is there a useful mental model you're failing to consider?
* Would Expected Value, Opportunity Cost, a Trade-off analysis, inversion, or another reasoning tool materially improve the decision?

The hard problem is calibration.

A useful system cannot constantly interrupt, nag, distract, or think on behalf of the user.

The intervention must be worth the interruption.

### AI as collaborator

The same telemetry could eventually allow an AI to recognize opportunities to help directly.

For example:

* noticing repetitive work that should be automated;
* recognizing that an existing tool or library solves a problem being approached manually;
* retrieving relevant information at the moment it becomes useful;
* helping execute an already-formed intent without taking over the reasoning that should remain with the human.

The distinction matters:

**CAI should augment cognition, not quietly replace it.**

## Excalidraw is the first sensor, not the product

CAI is currently built around Excalidraw because it provides a simple way to externalize thought into a machine-observable artifact.

But CAI is not fundamentally an Excalidraw tool.

The more general primitive is:

```text
human activity
    ↓
observable trace
    ↓
temporal interpretation
    ↓
intervention
    ↓
subsequent human activity
```

Excalidraw snapshots are simply the first instrumentation layer for experimenting with this loop.

Other sources of useful signal may come later.

## Current state

CAI is extremely early.

Right now it does two useful things:

**it records snapshots of changing Excalidraw files**, and **it turns those snapshots into a readable timeline of what changed.**

Given a directory such as:

```text
~/universe/
    foo.excalidraw
    bar.excalidraw
```

CAI watches it for changes.

When an `.excalidraw` file changes, CAI copies the new version into:

```text
~/universe/.snapshots/
```

producing files such as:

```text
1787087542871.foo.excalidraw
1787087549123.foo.excalidraw
1787087554812.bar.excalidraw
```

This intentionally primitive filesystem representation gives us enough temporal information to begin experimenting without prematurely designing infrastructure for a problem we don't understand yet.

Snapshots on their own are just states, so the second step reads them in order and describes the transitions:

```text
[+2m] 11:46:39 PM
    created text "what is "a tool" ?"
    edited text "what is "perfect" ?" (was "what is "the perfect Tool" ?")

--- 3.3h away ---

[+3.3h] 3:05:40 AM
    created rectangle (×3)
    created arrow
    deleted text "Compression"
```

Because Excalidraw gives every element a stable `id`, this is a keyed comparison rather than a text diff: we can say *this label was rewritten* or *this branch was deleted*, rather than merely *the file changed*.

The pauses are part of the signal. So are the reversals.

The next important milestone is not a sophisticated architecture.

It is the **minimum useful closed loop**:

```text
observe → interpret → intervene → observe again
```

Everything else can evolve from evidence gathered there.

## Getting started

Install dependencies:

```bash
bun install
```

Run CAI against a directory:

```bash
bun run src/snapshot.ts ~/universe
```

Then edit any `.excalidraw` file inside that directory.

CAI will create a `.snapshots` directory and record subsequent versions there.

Once you have at least two snapshots, read the trajectory back:

```bash
bun run src/delta.ts ~/universe
```

## Development philosophy

CAI is currently an experiment, not a platform.

Prefer:

* small experiments over speculative architecture;
* observable behavior over abstractions we merely expect to need;
* end-to-end feedback loops over infrastructure;
* real usage over imagined requirements;
* reversible decisions over premature commitments.

The architecture should emerge from attempts to make the cybernetic loop genuinely useful.

The first question is not:

> How do we build the ultimate cognitive architecture?

It is:

> What is the smallest thing we can build that produces enough useful feedback that we actually want to keep using it?

Then we iterate.
