/**
 * Describing text changes without spending the context window on the text.
 *
 * A whiteboard can hold paragraphs. Sending each version whole would cost more
 * than the whole trace is worth, and summarising lossily would hide the very
 * thing we are looking for. So: send the edit, not the document — an envelope
 * when text appears, and the changed span when it changes, with anything
 * elided marked as elided rather than dropped silently.
 */

/** Below this, the whole text is cheaper than describing it. */
const INLINE_LIMIT = 140;

const HEAD_CHARS = 90;
const TAIL_CHARS = 50;

/** Per-side cap on a rendered diff span. */
const DIFF_BUDGET = 180;

function oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, budget: number): string {
    const flat = oneLine(text);
    if (flat.length <= budget) return JSON.stringify(flat);
    return `${JSON.stringify(flat.slice(0, budget))} …[+${flat.length - budget} chars]`;
}

export function shape(text: string): string {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text.split("\n").length;
    return `${text.length} chars, ${words} words, ${lines} line${lines === 1 ? "" : "s"}`;
}

/** Stable enough to notice a user returning to wording they had abandoned. */
export function digest(text: string): string {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
}

/** Head and tail carry most of the meaning of a long block for very few tokens. */
export function envelope(text: string): string {
    const flat = oneLine(text);
    if (flat.length <= INLINE_LIMIT) return JSON.stringify(flat);

    const head = JSON.stringify(flat.slice(0, HEAD_CHARS));
    const tail = JSON.stringify(flat.slice(-TAIL_CHARS));
    return `${head} … ${tail} [${shape(text)}]`;
}

function words(text: string): string[] {
    return text.trim() ? text.trim().split(/\s+/) : [];
}

/**
 * Trimming the common prefix and suffix isolates the edit without a full diff.
 * Real edits are overwhelmingly one contiguous span, so this is both cheap and
 * usually exact — and when it isn't, the span simply widens.
 */
export function describeEdit(before: string, after: string): string {
    if (before === after) return "";

    const beforeWords = words(before);
    const afterWords = words(after);

    let prefix = 0;
    while (prefix < beforeWords.length && prefix < afterWords.length && beforeWords[prefix] === afterWords[prefix]) {
        prefix++;
    }

    let suffix = 0;
    while (
        suffix < beforeWords.length - prefix &&
        suffix < afterWords.length - prefix &&
        beforeWords[beforeWords.length - 1 - suffix] === afterWords[afterWords.length - 1 - suffix]
    ) {
        suffix++;
    }

    const removed = beforeWords.slice(prefix, beforeWords.length - suffix);
    const added = afterWords.slice(prefix, afterWords.length - suffix);

    const counts =
        `${added.length ? `+${added.length}w ` : ""}${removed.length ? `-${removed.length}w ` : ""}` +
        `${before.length}→${after.length} chars`;

    let kind: string;
    if (removed.length === 0 && prefix === beforeWords.length) kind = "appended";
    else if (removed.length === 0 && suffix === beforeWords.length) kind = "prepended";
    else if (added.length === 0) kind = "cut";
    else if (prefix === 0 && suffix === 0) kind = "rewrote";
    else kind = `revised ${Math.round((prefix / Math.max(afterWords.length, 1)) * 100)}% in`;

    const spans: string[] = [];
    if (removed.length) spans.push(`-${truncate(removed.join(" "), DIFF_BUDGET)}`);
    if (added.length) spans.push(`+${truncate(added.join(" "), DIFF_BUDGET)}`);

    return `${kind} (${counts}) ${spans.join(" ")}`.trim();
}
