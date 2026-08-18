# Overview

_CAI (Cybernetic AI): merge with superintelligence._

Imagine you are working on an Excalidraw file as a whiteboard, e.g.: `~/universe/whiteboard.excalidraw.svg`

Assume that you do **all** of your thinking on that same file. As you change the file, `cai` takes snapshots of it, then calculates the difference between each to create a timeline of micro-deltas which will then get fed into an AI.

The more explicit your thinking is, the better the signal will be. What is being modeled? The *trajectory of your cognition*. The Excalidraw artifact is basically telemetry leaking out of your cognitive process. This timeline of micro-deltas is way more informative of your thinking than just the final board: the final board says "here’s what the user thinks," delta history says "here’s how the user arrived there."

Why is this useful?

You can then implement this kind of feature on top of it:

1. **The AI can train you.** Like a chess coach watching your moves:
    - Are you thinking deeply and deliberately? The AI can now reward that just-in-time.
    - Are you jumping to a solution without understanding the problem? A slight punishment or warning.
    - Are you working on the right thing at all? It can infer the goal you are actually seeking (not what you say, but what you do) and detect whether it deviates from your stated intents (if any), suggesting a break to review it and take another course of action: for instance, in the case of vague intent, it could be very well to stop whatever it is you are doing and define it.
    - Is there something which you believe is not true and it’s predictably gonna lead you astray? It can pick that up.
    - Are there mental models which you are completely unaware of that could be extremely useful? Like Expected Value, Opportunity Window, Trade-off, etc.
2. **The AI can work with you.**
    - It can tell when you are doing something manual that you shouldn't.
    - It can tell when you are unaware of some vendor that is worth knowing.
    - Etc.

## Getting Started

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts ~/my-universe-directory
```

This project was created using `bun init` in bun v1.3.12. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
