"use client";
import { useSyncExternalStore } from "react";

let isOpen = false;
let initialDraft = "";
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function setAiChatOpen(open: boolean | ((prev: boolean) => boolean)) {
  const next = typeof open === "function" ? open(isOpen) : open;
  if (isOpen !== next) {
    isOpen = next;
    emitChange();
  }
}

export function openAiChatWithPrompt(prompt: string) {
  initialDraft = prompt;
  setAiChatOpen(true);
}

export function consumeInitialDraft(): string {
  const d = initialDraft;
  initialDraft = "";
  return d;
}

export function toggleAiChatOpen() {
  setAiChatOpen(!isOpen);
}

export function useAiChatOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => isOpen,
    () => false
  );
}
