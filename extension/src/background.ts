import { getConfig, type BackgroundRequest } from "./shared";

// Open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function upload(req: Extract<BackgroundRequest, { type: "upload" }>): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getConfig();
  if (!cfg.token) return { ok: false, error: "Set the extension token in the side panel settings." };
  const form = new FormData();
  form.set("clip_id", req.clipId);
  form.set("kind", req.kind);
  form.set("source", "extension");
  form.set("flow_url", req.flowUrl);
  if (req.queueId) form.set("queue_id", req.queueId);
  form.set("file", new File([base64ToBlob(req.base64, req.mime)], `flow.${req.mime.split("/")[1] ?? "bin"}`, { type: req.mime }));
  try {
    const res = await fetch(`${cfg.appOrigin}/api/assets`, {
      method: "POST",
      headers: { "x-extension-token": cfg.token },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** The page cannot read cross-origin media (CORS); the service worker can, via host permissions. */
async function fetchMedia(url: string): Promise<{ ok: boolean; mime?: string; base64?: string; error?: string }> {
  try {
    const res = await fetch(url, { credentials: "omit" }); // signed URL: no cookies needed
    if (!res.ok) return { ok: false, error: `Flow media returned HTTP ${res.status}` };
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { ok: true, mime: blob.type, base64: btoa(bin) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

// Messages from content script / side panel
chrome.runtime.onMessage.addListener((msg: BackgroundRequest, _sender, sendResponse) => {
  if (msg.type === "fetch-media") {
    fetchMedia(msg.url).then(sendResponse);
    return true;
  }
  if (msg.type === "upload") {
    upload(msg).then(sendResponse);
    return true;
  }
  return false;
});

// Messages from the web app (externally_connectable): the queue changed.
chrome.runtime.onMessageExternal.addListener((msg: BackgroundRequest, _sender, sendResponse) => {
  if (msg?.type === "queue-updated") {
    // Wake the side panel (if open) so it refreshes immediately.
    chrome.runtime.sendMessage({ type: "queue-updated" } satisfies BackgroundRequest).catch(() => {});
    sendResponse({ ok: true });
  }
  return false;
});
