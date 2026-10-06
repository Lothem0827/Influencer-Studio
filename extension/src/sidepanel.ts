import {
  FLOW_URL_PATTERNS,
  getConfig,
  getTarget,
  setConfig,
  setTarget,
  type ActiveTarget,
  type BackgroundRequest,
  type ContentRequest,
  type FillReport,
  type QueueItem,
  type Target,
} from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status");
const queueEl = $("queue");
const targetCurrent = $("target-current");
const targetSelect = $<HTMLSelectElement>("target-select");
const originInput = $<HTMLInputElement>("origin");
const tokenInput = $<HTMLInputElement>("token");

let items: QueueItem[] = [];
let targets: Target[] = [];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = await getConfig();
  if (!cfg.token) throw new Error("Open Settings and enter the extension token.");
  const res = await fetch(`${cfg.appOrigin}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), "x-extension-token": cfg.token, "content-type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function load() {
  statusEl.textContent = "Loading...";
  statusEl.className = "meta";
  try {
    const data = await api<{ items: QueueItem[]; targets: Target[] }>("/api/extension/queue");
    items = data.items;
    targets = data.targets;
    statusEl.textContent = `${items.length} in queue`;
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e);
    statusEl.className = "err";
  }
  render();
  await renderTarget();
}

function render() {
  if (!items.length) {
    queueEl.innerHTML = `<div class="card meta">Nothing queued. Use "Send to Flow" in the app.</div>`;
    return;
  }
  queueEl.innerHTML = items
    .map(
      (it) => `
    <div class="card" data-id="${it.id}">
      <div class="row">
        <span class="badge ${it.kind}">${it.kind}</span>
        ${it.status === "sent" ? `<span class="badge sent">filled</span>` : ""}
        <b>Clip ${it.clipIdx + 1}</b>
        <span class="meta">${esc(it.workspaceName)} / ${esc(it.projectTitle)}</span>
      </div>
      <pre>${esc(it.prompt)}</pre>
      <div class="row">
        <button class="primary" data-act="fill">Fill in Flow</button>
        <button data-act="copy">Copy</button>
        <button data-act="done">Done</button>
        <button data-act="skip">Remove</button>
      </div>
      <div class="meta" data-report></div>
    </div>`,
    )
    .join("");
}

async function renderTarget() {
  const t = await getTarget();
  targetCurrent.textContent = t ? `Uploading to: ${t.label}` : "No target selected.";
  targetCurrent.className = t ? "ok" : "meta";
  const options = [`<option value="">-</option>`];
  for (const p of targets) {
    options.push(`<optgroup label="${esc(p.projectTitle)}">`);
    for (const c of p.clips) {
      const value = `${c.id}|${esc(p.projectTitle)} / Clip ${c.idx + 1}`;
      options.push(`<option value="${value}"${t?.clipId === c.id && !t.queueId ? " selected" : ""}>Clip ${c.idx + 1}</option>`);
    }
    options.push(`</optgroup>`);
  }
  targetSelect.innerHTML = options.join("");
}

async function flowTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: FLOW_URL_PATTERNS });
  return tabs.find((t) => t.active) ?? tabs[0] ?? null;
}

function showReport(card: Element | null, r: FillReport) {
  const box = card?.querySelector("[data-report]");
  if (!box) return;
  const mark = (v: boolean | "skipped") => (v === "skipped" ? "-" : v ? "ok" : "no");
  box.innerHTML = `Prompt ${mark(r.prompt)} / Mode ${mark(r.mode)} / Ratio ${mark(r.aspect)} / Attach ${mark(r.attachment)}${
    r.notes.length ? `<br><span class="err">${r.notes.map(esc).join("<br>")}</span>` : ""
  }<br><span class="ok">Now press Generate in Flow.</span>`;
}

queueEl.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button[data-act]") as HTMLButtonElement | null;
  if (!btn) return;
  const card = btn.closest(".card")!;
  const item = items.find((i) => i.id === (card as HTMLElement).dataset.id);
  if (!item) return;
  const act = btn.dataset.act;

  try {
    if (act === "copy") {
      await navigator.clipboard.writeText(item.prompt);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    } else if (act === "fill") {
      const tab = await flowTab();
      if (!tab?.id) {
        showReport(card, { prompt: false, aspect: "skipped", mode: "skipped", attachment: "skipped", notes: ["Open Google Flow in a tab first."] });
        return;
      }
      const target: ActiveTarget = { clipId: item.clipId, queueId: item.id, label: `${item.projectTitle} / Clip ${item.clipIdx + 1}` };
      await setTarget(target);
      btn.disabled = true;
      btn.textContent = "Filling...";
      const report = (await chrome.tabs.sendMessage(tab.id, { type: "fill", item } satisfies ContentRequest).catch(
        () =>
          ({ prompt: false, aspect: "skipped", mode: "skipped", attachment: "skipped", notes: ["Reload the Flow tab so the extension can attach to it."] }) satisfies FillReport,
      )) as FillReport;
      btn.disabled = false;
      btn.textContent = "Fill in Flow";
      showReport(card, report);
      if (report.prompt) await api(`/api/extension/queue/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
      await renderTarget();
    } else if (act === "done" || act === "skip") {
      await api(`/api/extension/queue/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
      await load();
    }
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : String(err);
    statusEl.className = "err";
  }
});

targetSelect.addEventListener("change", async () => {
  if (!targetSelect.value) {
    await setTarget(null);
  } else {
    const [clipId, label] = targetSelect.value.split("|");
    await setTarget({ clipId, queueId: null, label: label.replace(/&amp;/g, "&") });
  }
  await renderTarget();
});

$("refresh").addEventListener("click", () => void load());

$("save").addEventListener("click", async () => {
  await setConfig({ appOrigin: originInput.value.trim().replace(/\/$/, ""), token: tokenInput.value.trim() });
  $("save-msg").textContent = "Saved";
  setTimeout(() => ($("save-msg").textContent = ""), 1500);
  await load();
});

chrome.runtime.onMessage.addListener((msg: BackgroundRequest) => {
  if (msg.type === "queue-updated") void load();
});

(async () => {
  const cfg = await getConfig();
  originInput.value = cfg.appOrigin;
  tokenInput.value = cfg.token;
  await load();
  setInterval(() => void load(), 6000);
})();
