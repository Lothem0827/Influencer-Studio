export interface QueueItem {
  id: string;
  status: "queued" | "sent" | "done";
  kind: "still" | "video";
  prompt: string;
  clipId: string;
  clipIdx: number;
  durationS: number;
  projectId: string;
  projectTitle: string;
  aspectRatio: string;
  workspaceName: string;
  refImageUrl: string | null;
  characterSheetUrl: string | null;
  createdAt: string;
}

export interface Target {
  projectId: string;
  projectTitle: string;
  clips: { id: string; idx: number }[];
}

export interface Config {
  appOrigin: string;
  token: string;
}

/** Where "Use this" uploads to. Set when the user clicks Fill or picks a clip in the panel. */
export interface ActiveTarget {
  clipId: string;
  queueId: string | null;
  label: string;
}

export type ContentRequest = { type: "fill"; item: QueueItem } | { type: "ping" };

export interface FillReport {
  prompt: boolean;
  aspect: boolean | "skipped";
  mode: boolean | "skipped";
  attachment: boolean | "skipped";
  notes: string[];
}

export type BackgroundRequest =
  | { type: "queue-updated" }
  | { type: "fetch-media"; url: string }
  | { type: "upload"; clipId: string; queueId: string | null; kind: "image" | "video"; mime: string; base64: string; flowUrl: string };

export const DEFAULT_CONFIG: Config = { appOrigin: __DEFAULT_APP_ORIGIN__, token: __DEFAULT_TOKEN__ };

export async function getConfig(): Promise<Config> {
  const { config } = await chrome.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(config as Partial<Config> | undefined) };
}

export async function setConfig(c: Config): Promise<void> {
  await chrome.storage.local.set({ config: c });
}

export async function getTarget(): Promise<ActiveTarget | null> {
  const { target } = await chrome.storage.local.get("target");
  return (target as ActiveTarget | undefined) ?? null;
}

export async function setTarget(t: ActiveTarget | null): Promise<void> {
  if (t) await chrome.storage.local.set({ target: t });
  else await chrome.storage.local.remove("target");
}

// Broad on purpose: Flow has lived at /fx/tools/flow, /fx/<locale>/tools/flow and /flow/...
export const FLOW_URL_PATTERNS = ["https://flow.google.com/*", "https://labs.google/*flow*"];
