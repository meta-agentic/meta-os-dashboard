// MOS-7 (prompt console) integration point — STUB until MOS-7 lands.
//
// Contract: MOS-7's prompt console, when mounted, registers a handler on
// `window.__metaOsPromptConsole` shaped as { open(promptText: string): void }.
// It receives the text as an EDITABLE prompt (the user reviews/sends), not a
// fire-and-forget command. Onboarding calls openPromptConsole() to hand off the
// bootstrap conversation. Until MOS-7 exists this returns false so the caller
// can fall back to showing the prompt inline for copy/paste.
//
// FLAG FOR REVIEW (MOS-19 PR): this is the only coupling to MOS-7. When MOS-7
// merges, verify the registered global name + method signature match this
// contract, or update both sides together.

export function isPromptConsoleAvailable() {
  return typeof window !== 'undefined' && typeof window.__metaOsPromptConsole?.open === 'function'
}

export function openPromptConsole(promptText) {
  if (!isPromptConsoleAvailable()) return false
  try {
    window.__metaOsPromptConsole.open(promptText)
    return true
  } catch {
    return false
  }
}
