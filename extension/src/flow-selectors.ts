/**
 * Every assumption about Google Flow's DOM lives in this one file.
 * When Flow changes its UI, fix the selectors/labels here and rebuild.
 * Nothing in here ever clicks a "Generate" button.
 */

/** Candidates for the prompt box, tried in order. First visible match wins. */
export const PROMPT_BOX_SELECTORS = [
  "textarea[placeholder*='prompt' i]",
  "textarea[placeholder*='create' i]",
  "textarea[placeholder*='describe' i]",
  "[role='textbox'][contenteditable='true']",
  "div[contenteditable='true']",
  "textarea",
];

/** Text of controls we may click to configure the request (never "generate"). */
export const ASPECT_TRIGGER_TEXT = [/aspect/i, /\b(16:9|9:16|1:1|4:3|3:4)\b/];
export const ASPECT_OPTION_TEXT: Record<string, RegExp> = {
  "9:16": /^\s*(9\s*:\s*16|portrait)\s*$/i,
  "16:9": /^\s*(16\s*:\s*9|landscape)\s*$/i,
  "1:1": /^\s*(1\s*:\s*1|square)\s*$/i,
  "4:5": /^\s*(4\s*:\s*5)\s*$/i,
};

export const MODE_TEXT: Record<"still" | "video", RegExp[]> = {
  still: [/^\s*(image|images|text to image|create image)\s*$/i],
  video: [/^\s*(video|videos|frames to video|image to video|ingredients to video)\s*$/i],
};

/** Labels that must never be auto-clicked. */
export const FORBIDDEN_CLICK_TEXT = /generate|create video|run|submit|send/i;

export const FILE_INPUT_SELECTOR = "input[type='file']";

/** Buttons that reveal a hidden file input (clicked only to attach a reference, never to generate). */
export const ADD_MEDIA_BUTTON_TEXT = [/add media/i, /upload/i, /add image/i, /reference/i, /^\+$/];

/** Result tiles: media bigger than this (CSS px) gets a "Use this" affordance. */
export const MIN_RESULT_WIDTH = 140;
export const MIN_RESULT_HEIGHT = 140;

export const RESULT_MEDIA_SELECTOR = "img, video";

export function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

export function findPromptBox(): HTMLElement | null {
  for (const sel of PROMPT_BOX_SELECTORS) {
    const el = [...document.querySelectorAll<HTMLElement>(sel)].find(isVisible);
    if (el) return el;
  }
  return null;
}

export function clickableByText(patterns: RegExp[], root: ParentNode = document): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>("button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='radio'], li, label");
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
    if (!text || text.length > 40) continue;
    if (FORBIDDEN_CLICK_TEXT.test(text)) continue;
    if (patterns.some((p) => p.test(text))) return el;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* A result only counts once it is opened on its own page:             */
/* https://flow.google.com/project/<projectId>/edit/<mediaId>          */
/* ------------------------------------------------------------------ */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EDIT_PATH_RE = new RegExp(`^/project/${UUID}/edit/${UUID}/?$`, "i");
const FLOW_HOSTS = ["flow.google.com", "labs.google"];

/** The canonical link of the result open in this tab, or null when this is not a result page. */
export function currentFlowEditUrl(): string | null {
  if (location.protocol !== "https:" || !FLOW_HOSTS.includes(location.hostname)) return null;
  if (!EDIT_PATH_RE.test(location.pathname)) return null;
  return `${location.origin}${location.pathname.replace(/\/$/, "")}`;
}