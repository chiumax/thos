/**
 * Persistence helpers for the default system prompt setting.
 */

const DEFAULT_PROMPT_KEY = "thos-default-prompt";

export function getDefaultPrompt(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEFAULT_PROMPT_KEY) ?? "";
}

export function setDefaultPrompt(value: string) {
  if (typeof window === "undefined") return;
  if (value) {
    localStorage.setItem(DEFAULT_PROMPT_KEY, value);
  } else {
    localStorage.removeItem(DEFAULT_PROMPT_KEY);
  }
}
