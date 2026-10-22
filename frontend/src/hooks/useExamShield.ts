import { useEffect, useRef, useState } from "react";

export type ExamShieldState = {
  /** True while tab/window is not focused — content should be covered. */
  veiled: boolean;
  /** Fullscreen currently active. */
  fullscreen: boolean;
  /** Ask browser for fullscreen (user gesture recommended). */
  enterFullscreen: () => Promise<void>;
};

/**
 * Best-effort exam capture shield for the web.
 * OS-level screenshots / hardware buttons cannot be fully blocked in browsers;
 * this deters casual capture, copy, print, DevTools, and drag/select.
 */
export function useExamShield(enabled: boolean): ExamShieldState {
  const [veiled, setVeiled] = useState(false);
  const [fullscreen, setFullscreen] = useState(
    () => typeof document !== "undefined" && !!document.fullscreenElement
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      setVeiled(false);
      document.documentElement.classList.remove("exam-secure");
      document.body?.classList.remove("exam-secure");
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    root.classList.add("exam-secure");
    body.classList.add("exam-secure");

    const veil = (on: boolean) => setVeiled(on);

    const flashVeil = () => {
      veil(true);
      window.setTimeout(() => {
        if (document.visibilityState === "visible" && document.hasFocus()) {
          veil(false);
        }
      }, 1200);
    };

    const onVisibility = () => {
      veil(document.visibilityState !== "visible");
    };
    const onBlur = () => veil(true);
    const onFocus = () => {
      if (document.visibilityState === "visible") veil(false);
    };
    const onFullscreen = () => {
      setFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) veil(false);
    };

    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const code = e.code;
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // PrintScreen / screenshot chords (best-effort; OS may still capture)
      if (e.key === "PrintScreen" || code === "PrintScreen") {
        block(e);
        flashVeil();
        return;
      }

      // F12 and function-key DevTools openers
      if (key === "f12" || code === "F12") {
        block(e);
        return;
      }

      // Ctrl/Cmd + C / X / A / V / P / S / U / O (copy, cut, select-all, paste, print, save, view-source, open)
      if (mod && !alt) {
        if (
          key === "c" ||
          key === "x" ||
          key === "a" ||
          key === "v" ||
          key === "p" ||
          key === "s" ||
          key === "u" ||
          key === "o" ||
          code === "KeyC" ||
          code === "KeyX" ||
          code === "KeyA" ||
          code === "KeyV" ||
          code === "KeyP" ||
          code === "KeyS" ||
          code === "KeyU" ||
          code === "KeyO"
        ) {
          block(e);
          return;
        }
      }

      // Ctrl/Cmd + Shift + I / J / C / K / M / P / S — DevTools / inspect / snipping
      if (mod && shift) {
        if (
          key === "i" ||
          key === "j" ||
          key === "c" ||
          key === "k" ||
          key === "m" ||
          key === "p" ||
          key === "s" ||
          code === "KeyI" ||
          code === "KeyJ" ||
          code === "KeyC" ||
          code === "KeyK" ||
          code === "KeyM" ||
          code === "KeyP" ||
          code === "KeyS"
        ) {
          block(e);
          if (key === "s" || code === "KeyS") flashVeil();
          return;
        }
      }

      // Ctrl+Shift+Del (clear data) / Ctrl+Shift+N (incognito) — soft block
      if (mod && shift && (key === "delete" || key === "n" || code === "KeyN")) {
        block(e);
      }
    };

    const onContext = (e: MouseEvent) => block(e);
    const onCopy = (e: ClipboardEvent) => block(e);
    const onCut = (e: ClipboardEvent) => block(e);
    const onPaste = (e: ClipboardEvent) => block(e);
    const onSelectStart = (e: Event) => block(e);
    const onDragStart = (e: DragEvent) => block(e);
    const onDrop = (e: DragEvent) => block(e);
    const onDragOver = (e: DragEvent) => block(e);
    const onBeforePrint = (e: Event) => block(e);

    // Some browsers fire beforeprint; also try to clear selection continuously
    const clearSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) sel.removeAllRanges();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("contextmenu", onContext, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("selectstart", onSelectStart, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragover", onDragOver, true);
    window.addEventListener("beforeprint", onBeforePrint);
    document.addEventListener("selectionchange", clearSelection);

    onVisibility();

    return () => {
      root.classList.remove("exam-secure");
      body.classList.remove("exam-secure");
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("contextmenu", onContext, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("selectstart", onSelectStart, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("beforeprint", onBeforePrint);
      document.removeEventListener("selectionchange", clearSelection);
    };
  }, [enabled]);

  const enterFullscreen = async () => {
    if (!enabledRef.current) return;
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      try {
        await el.requestFullscreen();
      } catch {
        /* user gesture / policy may deny */
      }
    }
  };

  return { veiled, fullscreen, enterFullscreen };
}
