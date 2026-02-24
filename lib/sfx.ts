/**
 * Sound effects module for thos.
 *
 * Maps agent events and tool types to sound pools. Each pool has
 * multiple variants — a random one is picked on each play to keep
 * it stimulating. Uses the Web Audio API via soundcn's sound engine.
 *
 * Settings (master volume, per-category volume/enabled) are persisted
 * to localStorage and exposed via getSfxSettings/setSfxSettings.
 */

import { playSound } from "@/lib/sound-engine";
import type { SoundAsset } from "@/lib/sound-types";

// ── Impact sounds (Write / Edit / MultiEdit) ─────────────────────────
import { impactGenericLight000Sound } from "@/lib/impact-generic-light-000";
import { impactGenericLight001Sound } from "@/lib/impact-generic-light-001";
import { impactGenericLight002Sound } from "@/lib/impact-generic-light-002";
import { impactGenericLight003Sound } from "@/lib/impact-generic-light-003";
import { impactGenericLight004Sound } from "@/lib/impact-generic-light-004";

// ── Click sounds (Read) ──────────────────────────────────────────────
import { clickSoftSound } from "@/lib/click-soft";
import { click001Sound } from "@/lib/click-001";
import { click002Sound } from "@/lib/click-002";
import { click003Sound } from "@/lib/click-003";
import { click004Sound } from "@/lib/click-004";

// ── Glitch sounds (Bash) ─────────────────────────────────────────────
import { glitch001Sound } from "@/lib/glitch-001";
import { glitch002Sound } from "@/lib/glitch-002";
import { glitch003Sound } from "@/lib/glitch-003";
import { glitch004Sound } from "@/lib/glitch-004";

// ── Tick sounds (Grep / Glob / search tools) ─────────────────────────
import { tick001Sound } from "@/lib/tick-001";
import { tick002Sound } from "@/lib/tick-002";
import { tick004Sound } from "@/lib/tick-004";

// ── Confirmation sounds (task result / done) ─────────────────────────
import { confirmation001Sound } from "@/lib/confirmation-001";
import { confirmation002Sound } from "@/lib/confirmation-002";
import { confirmation003Sound } from "@/lib/confirmation-003";
import { confirmation004Sound } from "@/lib/confirmation-004";

// ── Error sounds ─────────────────────────────────────────────────────
import { error001Sound } from "@/lib/error-001";
import { error002Sound } from "@/lib/error-002";
import { error003Sound } from "@/lib/error-003";

// ── Question sounds (control requests / user prompts) ────────────────
import { question001Sound } from "@/lib/question-001";
import { question002Sound } from "@/lib/question-002";
import { question003Sound } from "@/lib/question-003";

// ── Select sounds (user message send) ─────────────────────────────────
import { select001Sound } from "@/lib/select-001";
import { select002Sound } from "@/lib/select-002";
import { select003Sound } from "@/lib/select-003";

// ── Session lifecycle ────────────────────────────────────────────────
import { maximize001Sound } from "@/lib/maximize-001";
import { maximize002Sound } from "@/lib/maximize-002";
import { maximize003Sound } from "@/lib/maximize-003";
import { maximize004Sound } from "@/lib/maximize-004";

// ── Sound pools ──────────────────────────────────────────────────────

const POOLS = {
  codeWrite: [
    impactGenericLight000Sound,
    impactGenericLight001Sound,
    impactGenericLight002Sound,
    impactGenericLight003Sound,
    impactGenericLight004Sound,
  ],
  codeRead: [
    clickSoftSound,
    click001Sound,
    click002Sound,
    click003Sound,
    click004Sound,
  ],
  bash: [
    glitch001Sound,
    glitch002Sound,
    glitch003Sound,
    glitch004Sound,
  ],
  search: [
    tick001Sound,
    tick002Sound,
    tick004Sound,
  ],
  done: [
    confirmation001Sound,
    confirmation002Sound,
    confirmation003Sound,
    confirmation004Sound,
  ],
  error: [
    error001Sound,
    error002Sound,
    error003Sound,
  ],
  question: [
    question001Sound,
    question002Sound,
    question003Sound,
  ],
  send: [
    select001Sound,
    select002Sound,
    select003Sound,
  ],
  begin: [
    maximize001Sound,
    maximize002Sound,
    maximize003Sound,
    maximize004Sound,
  ],
} as const;

// ── Category registry (used by settings UI) ─────────────────────────

export type SfxCategoryKey = keyof typeof POOLS;

export interface SfxCategory {
  key: SfxCategoryKey;
  label: string;
  description: string;
  color: string;
  defaultVolume: number;
  pool: readonly SoundAsset[];
}

export const SFX_CATEGORIES: SfxCategory[] = [
  { key: "codeWrite", label: "Code Write", description: "Write, Edit, MultiEdit", color: "bg-green-400", defaultVolume: 0.3, pool: POOLS.codeWrite },
  { key: "codeRead", label: "Code Read", description: "Read", color: "bg-blue-400", defaultVolume: 0.3, pool: POOLS.codeRead },
  { key: "bash", label: "Bash", description: "Bash", color: "bg-orange-400", defaultVolume: 0.3, pool: POOLS.bash },
  { key: "search", label: "Search", description: "Grep, Glob, WebFetch, WebSearch", color: "bg-purple-400", defaultVolume: 0.3, pool: POOLS.search },
  { key: "send", label: "Message Send", description: "User message send", color: "bg-lime-400", defaultVolume: 0.3, pool: POOLS.send },
  { key: "begin", label: "Session Start", description: "Agent session init", color: "bg-sky-400", defaultVolume: 0.35, pool: POOLS.begin },
  { key: "done", label: "Done", description: "Task result (success)", color: "bg-emerald-400", defaultVolume: 0.4, pool: POOLS.done },
  { key: "error", label: "Error", description: "Errors", color: "bg-red-400", defaultVolume: 0.35, pool: POOLS.error },
  { key: "question", label: "Question", description: "Control requests, approvals", color: "bg-amber-400", defaultVolume: 0.4, pool: POOLS.question },
];

// ── Tool → category mapping ─────────────────────────────────────────

const TOOL_CATEGORY: Record<string, SfxCategoryKey> = {
  Write: "codeWrite",
  Edit: "codeWrite",
  MultiEdit: "codeWrite",
  NotebookEdit: "codeWrite",
  Read: "codeRead",
  Bash: "bash",
  Grep: "search",
  Glob: "search",
  Task: "search",
  WebFetch: "search",
  WebSearch: "search",
};

// ── Settings ─────────────────────────────────────────────────────────

export interface SfxCategorySettings {
  volume: number;   // 0–1
  enabled: boolean;
}

export interface SfxSettings {
  master: number;   // 0–1
  muted: boolean;
  categories: Record<SfxCategoryKey, SfxCategorySettings>;
}

const STORAGE_KEY = "thos-sfx-settings";

function defaultSettings(): SfxSettings {
  const categories = {} as Record<SfxCategoryKey, SfxCategorySettings>;
  for (const cat of SFX_CATEGORIES) {
    categories[cat.key] = { volume: cat.defaultVolume, enabled: true };
  }
  return { master: 1, muted: false, categories };
}

let _settings: SfxSettings | null = null;

export function getSfxSettings(): SfxSettings {
  if (_settings) return _settings;
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SfxSettings>;
      const defaults = defaultSettings();
      _settings = {
        master: parsed.master ?? defaults.master,
        muted: parsed.muted ?? defaults.muted,
        categories: { ...defaults.categories, ...parsed.categories },
      };
    } else {
      _settings = defaultSettings();
    }
  } catch {
    _settings = defaultSettings();
  }
  return _settings!;
}

export function setSfxSettings(settings: SfxSettings) {
  _settings = settings;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage full or unavailable
    }
  }
}

// ── Internal helpers ─────────────────────────────────────────────────

function pick(pool: readonly SoundAsset[]): SoundAsset {
  return pool[Math.floor(Math.random() * pool.length)];
}

function playCat(categoryKey: SfxCategoryKey) {
  const s = getSfxSettings();
  if (s.muted) return;
  const cat = s.categories[categoryKey];
  if (!cat?.enabled) return;
  const volume = cat.volume * s.master;
  if (volume <= 0) return;
  const pool = POOLS[categoryKey];
  playSound(pick(pool).dataUri, { volume });
}

// ── Public API ───────────────────────────────────────────────────────

/** Play SFX for a tool call. Returns silently if the tool has no mapped sound. */
export function sfxTool(toolName: string) {
  const cat = TOOL_CATEGORY[toolName];
  if (!cat) return;
  playCat(cat);
}

/** Play SFX for a successful task result. */
export function sfxDone() {
  playCat("done");
}

/** Play SFX for an error result. */
export function sfxError() {
  playCat("error");
}

/** Play SFX for a control request / question prompt. */
export function sfxQuestion() {
  playCat("question");
}

/** Play SFX when the user sends a message. */
export function sfxSend() {
  playCat("send");
}

/** Play SFX for session start. */
export function sfxBegin() {
  playCat("begin");
}

/** Preview a specific category's sound (ignores mute/enabled, uses category volume * master). */
export function sfxPreview(categoryKey: SfxCategoryKey) {
  const s = getSfxSettings();
  const cat = s.categories[categoryKey];
  const volume = (cat?.volume ?? 0.3) * s.master;
  const pool = POOLS[categoryKey];
  playSound(pick(pool).dataUri, { volume: Math.max(volume, 0.1) });
}
