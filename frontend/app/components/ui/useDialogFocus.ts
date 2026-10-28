import { useEffect, useRef, type RefObject } from "react";

interface DialogEntry {
  panel: HTMLElement;
  onClose: () => void;
}

const dialogStack: DialogEntry[] = [];

function topDialog() {
  return dialogStack
    .filter(({ panel }) => panel.isConnected)
    .sort((a, b) =>
      a.panel.compareDocumentPosition(b.panel) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    )
    .at(-1);
}

function isVisible(element: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (current.hidden || current.inert || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return false;
    }
  }
  return true;
}

export function useDialogFocus<T extends HTMLElement>(
  panelRef: RefObject<T | null>,
  isOpen: boolean,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const ownerDialog = previousFocus?.closest<HTMLElement>('[role="dialog"]') ?? null;
    const entry: DialogEntry = {
      panel,
      onClose: () => onCloseRef.current(),
    };
    dialogStack.push(entry);
    queueMicrotask(() => {
      if (topDialog() !== entry) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.closest('[role="dialog"]') === panel &&
          !element.matches(":disabled") &&
          isVisible(element),
      );
      const initialFocus = initialFocusRef?.current;
      (initialFocus &&
      panel.contains(initialFocus) &&
      !initialFocus.matches(":disabled") &&
      initialFocus.closest('[role="dialog"]') === panel &&
      isVisible(initialFocus)
        ? initialFocus
        : focusable[0] ?? panel
      ).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (topDialog() !== entry) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        entry.onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.closest('[role="dialog"]') === panel &&
          !element.matches(":disabled") &&
          isVisible(element),
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = dialogStack.indexOf(entry);
      if (index !== -1) dialogStack.splice(index, 1);
      if (previousFocus?.isConnected) previousFocus.focus();
      else if (ownerDialog?.isConnected) ownerDialog.focus();
    };
  }, [isOpen, panelRef, initialFocusRef]);
}
