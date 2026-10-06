import {
  ADD_MEDIA_BUTTON_TEXT,
  ASPECT_OPTION_TEXT,
  ASPECT_TRIGGER_TEXT,
  FILE_INPUT_SELECTOR,
  MIN_RESULT_HEIGHT,
  MIN_RESULT_WIDTH,
  MODE_TEXT,
  RESULT_MEDIA_SELECTOR,
  clickableByText,
  findPromptBox,
  currentFlowEditUrl,
} from "./flow-selectors";
import {
  getConfig,
  getTarget,
  type BackgroundRequest,
  type ContentRequest,
  type FillReport,
  type QueueItem,
} from "./shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Fill: put the prompt in Flow's box, set ratio/mode, attach a ref.   */
/* The user always presses Generate themselves.                        */
/* ------------------------------------------------------------------ */

function setPromptText(box: HTMLElement, text: string): boolean {
  box.focus();
  if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
    const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return box.value === text;
  }
  // contenteditable
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand("insertText", false, text);
  if (!ok || !(box.innerText ?? "").includes(text.slice(0, 20))) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
  return (box.innerText ?? "").includes(text.slice(0, 20));
}

async function setAspect(ratio: string): Promise<boolean> {
  const optionRe = ASPECT_OPTION_TEXT[ratio];
  if (!optionRe) return false;
  // Already visible as an option (e.g. segmented control)?
  let opt = clickableByText([optionRe]);
  if (!opt) {
    const trigger = clickableByText(ASPECT_TRIGGER_TEXT);
    if (!trigger) return false;
    trigger.click();
    await sleep(250);
    opt = clickableByText([optionRe]);
  }
  if (!opt) return false;
  opt.click();
  await sleep(150);
  return true;
}

async function setMode(kind: "still" | "video"): Promise<boolean> {
  const el = clickableByText(MODE_TEXT[kind]);
  if (!el) return false;
  el.click();
  await sleep(200);
  return true;
}

async function fetchAsFile(url: string, fallbackName: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = blob.type.split("/")[1] ?? "png";
    return new File([blob], `${fallbackName}.${ext}`, { type: blob.type || "image/png" });
  } catch {
    return null;
  }
}

async function attachFile(file: File): Promise<boolean> {
  const tryInput = (): boolean => {
    const input = [...document.querySelectorAll<HTMLInputElement>(FILE_INPUT_SELECTOR)].find(
      (i) => !i.accept || i.accept.includes("image") || i.accept === "*/*",
    );
    if (!input) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  if (tryInput()) return true;

  // Some UIs only mount the input after clicking an "add media" control.
  const btn = clickableByText(ADD_MEDIA_BUTTON_TEXT);
  if (btn) {
    btn.click();
    await sleep(400);
    if (tryInput()) return true;
  }

  // Last resort: simulate pasting the image into the prompt box.
  const box = findPromptBox();
  if (box) {
    const dt = new DataTransfer();
    dt.items.add(file);
    box.focus();
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  }
  return false;
}

async function fill(item: QueueItem): Promise<FillReport> {
  const report: FillReport = { prompt: false, aspect: "skipped", mode: "skipped", attachment: "skipped", notes: [] };

  report.mode = await setMode(item.kind);
  if (!report.mode) report.notes.push(`Could not find the ${item.kind === "still" ? "Image" : "Video"} mode control. Select it manually.`);

  report.aspect = await setAspect(item.aspectRatio);
  if (!report.aspect) report.notes.push(`Could not set ${item.aspectRatio}. Set the aspect ratio manually.`);

  const ref = item.kind === "video" ? item.refImageUrl : item.characterSheetUrl;
  if (ref) {
    const file = await fetchAsFile(ref, item.kind === "video" ? `clip-${item.clipIdx + 1}-still` : "character-sheet");
    if (!file) {
      report.attachment = false;
      report.notes.push("Could not download the reference image to attach.");
    } else {
      report.attachment = await attachFile(file);
      if (!report.attachment) report.notes.push("Could not attach the reference image. Drag it in manually.");
    }
  }

  const box = findPromptBox();
  if (!box) {
    report.notes.push("Could not find Flow's prompt box.");
  } else {
    report.prompt = setPromptText(box, item.prompt);
    if (!report.prompt) report.notes.push("Prompt box did not accept the text. Paste it manually (it is on your clipboard).");
  }

  // Always leave the prompt on the clipboard as a fallback.
  try {
    await navigator.clipboard.writeText(item.prompt);
  } catch {
    /* clipboard needs a user gesture on some pages; ignore */
  }
  toast(report.prompt ? "Prompt filled. Press Generate in Flow." : "Could not fill the prompt box automatically.");
  return report;
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "fill") {
    fill(msg.item).then(sendResponse, (e) =>
      sendResponse({ prompt: false, aspect: "skipped", mode: "skipped", attachment: "skipped", notes: [String(e)] } satisfies FillReport),
    );
    return true; // async response
  }
  return false;
});

/* ------------------------------------------------------------------ */
/* "Use this": a floating button over any large result image/video.    */
/* ------------------------------------------------------------------ */

const HOST_ID = "influencer-studio-use-this";
// After an extension reload the previous script keeps running in already-open tabs and leaves its
// button behind. Drop that stale UI so only this script's button can ever show.
document.getElementById(HOST_ID)?.remove();
let hovered: HTMLImageElement | HTMLVideoElement | null = null;
let button: HTMLButtonElement | null = null;
let hideTimer: number | undefined;

function ensureButton(): HTMLButtonElement {
  if (button) return button;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      button { position: fixed; display: none; padding: 6px 10px; border: 0; border-radius: 8px;
        background: #a78bfa; color: #0b0b0f; font: 600 12px system-ui, sans-serif; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,.4); }
      button:hover { background: #c4b5fd; }
      button[data-busy="1"] { opacity: .6; pointer-events: none; }
      .toast { position: fixed; right: 16px; bottom: 16px; max-width: 320px; padding: 10px 12px; border-radius: 8px;
        background: #14141b; color: #ececf1; border: 1px solid #272735; font: 12px system-ui, sans-serif; display: none; white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
    <button type="button">Use this</button>
    <div class="toast"></div>`;
  document.documentElement.appendChild(host);
  button = shadow.querySelector("button")!;
  button.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  button.addEventListener("mouseleave", scheduleHide);
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hovered) void useThis(hovered);
  });
  return button;
}

function toast(message: string) {
  ensureButton();
  const host = document.getElementById(HOST_ID);
  const el = host?.shadowRoot?.querySelector<HTMLElement>(".toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  window.setTimeout(() => (el.style.display = "none"), 4500);
}

function scheduleHide() {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (button) button.style.display = "none";
    hovered = null;
  }, 350);
}

function isResultMedia(el: Element): el is HTMLImageElement | HTMLVideoElement {
  if (!(el instanceof HTMLImageElement || el instanceof HTMLVideoElement)) return false;
  if (el.closest(`#${HOST_ID}`)) return false;
  const r = el.getBoundingClientRect();
  return r.width >= MIN_RESULT_WIDTH && r.height >= MIN_RESULT_HEIGHT;
}

document.addEventListener(
  "mouseover",
  (e) => {
    // Only on a result's own page (/project/<id>/edit/<mediaId>), never on the grid.
    const flowUrl = currentFlowEditUrl();
    if (!flowUrl) {
      if (button) button.style.display = "none";
      hovered = null;
      return;
    }
    const target = (e.target as Element | null)?.closest?.(RESULT_MEDIA_SELECTOR) ?? null;
    // Overlays often sit on top of the media: also look under the cursor.
    const media =
      (target && isResultMedia(target) ? target : null) ??
      document.elementsFromPoint(e.clientX, e.clientY).find(isResultMedia) ??
      null;
    if (!media) return;
    window.clearTimeout(hideTimer);
    hovered = media;
    const btn = ensureButton();
    const r = media.getBoundingClientRect();
    btn.style.display = "block";
    btn.style.top = `${Math.max(8, r.top + 8)}px`;
    btn.style.left = `${Math.max(8, r.right - 92)}px`;
    btn.textContent = media instanceof HTMLVideoElement ? "Use this video" : "Use this image";
    btn.title = flowUrl;
  },
  true,
);
document.addEventListener(
  "mouseout",
  (e) => {
    const target = (e.target as Element | null)?.closest?.(RESULT_MEDIA_SELECTOR);
    if (target && target === hovered) scheduleHide();
  },
  true,
);
window.addEventListener("scroll", () => button && (button.style.display = "none"), true);

function mediaUrl(el: HTMLImageElement | HTMLVideoElement): string | null {
  if (el instanceof HTMLVideoElement) {
    return el.currentSrc || el.src || el.querySelector("source")?.src || null;
  }
  return el.currentSrc || el.src || null;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobFromUrl(url: string): Promise<Blob> {
  try {
    // The URL is already signed; sending cookies would make a wildcard CORS response fail.
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } catch (direct) {
    // Usually CORS: the media lives on another Google host. Let the service worker fetch it.
    const res = (await chrome.runtime.sendMessage({ type: "fetch-media", url } satisfies BackgroundRequest)) as
      | { ok: boolean; mime?: string; base64?: string; error?: string }
      | undefined;
    if (res?.ok && res.base64) return base64ToBlob(res.base64, res.mime || "application/octet-stream");
    const why = res?.error ?? (direct instanceof Error ? direct.message : "unknown error");
    throw new Error(`Could not download the media from Flow (${why}).`);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function useThis(el: HTMLImageElement | HTMLVideoElement) {
  const btn = ensureButton();
  const flowUrl = currentFlowEditUrl();
  if (!flowUrl) {
    toast("Open the image or video on its own page first (a link like flow.google.com/project/.../edit/...).");
    return;
  }
  const target = await getTarget();
  if (!target) {
    toast("Pick a clip first: open the Influencer Studio side panel and click Fill, or choose a target clip.");
    return;
  }
  const url = mediaUrl(el);
  if (!url) {
    toast("Could not find the media URL for this tile.");
    return;
  }
  const kind: "image" | "video" = el instanceof HTMLVideoElement ? "video" : "image";
  btn.dataset.busy = "1";
  toast(`Uploading ${kind} to ${target.label}...\n${flowUrl}`);
  try {
    const blob = await blobFromUrl(url);
    const cfg = await getConfig();
    if (!cfg.token) throw new Error("Set the extension token in the side panel settings.");
    const form = new FormData();
    form.set("clip_id", target.clipId);
    form.set("kind", kind);
    form.set("source", "extension");
    form.set("flow_url", flowUrl);
    if (target.queueId) form.set("queue_id", target.queueId);
    form.set("file", new File([blob], `flow.${blob.type.split("/")[1] ?? (kind === "video" ? "mp4" : "png")}`, { type: blob.type }));

    let ok = false;
    let message = "";
    try {
      const res = await fetch(`${cfg.appOrigin}/api/assets`, {
        method: "POST",
        headers: { "x-extension-token": cfg.token },
        body: form,
      });
      ok = res.ok;
      if (!ok) message = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      // Direct call blocked (CORS / private-network rules): hand off to the service worker.
      const req: BackgroundRequest = {
        type: "upload",
        clipId: target.clipId,
        queueId: target.queueId,
        kind,
        mime: blob.type,
        base64: await blobToBase64(blob),
        flowUrl,
      };
      const res = (await chrome.runtime.sendMessage(req)) as { ok: boolean; error?: string } | undefined;
      ok = Boolean(res?.ok);
      message = res?.error ?? "";
    }
    if (!ok) throw new Error(message || "Upload failed");
    toast(`Saved to ${target.label}.\n${flowUrl}`);
    chrome.runtime.sendMessage({ type: "queue-updated" } satisfies BackgroundRequest).catch(() => {});
  } catch (e) {
    toast(e instanceof Error ? e.message : "Upload failed");
  } finally {
    delete btn.dataset.busy;
  }
}
