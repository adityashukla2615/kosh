/**
 * Global keyboard shortcuts.
 *
 * The sidebar numbers its sections 1-8, which is a promise the app should keep:
 * pressing those digits jumps to them. `?` opens the cheat sheet, `/` focuses
 * whatever the page considers its input, Escape backs out.
 */
import { useEffect } from 'react';

const TYPING = /^(input|textarea|select)$/i;

/** True when the user is typing, so we leave their keystrokes alone. */
export function isTyping(el) {
  return !!el && (TYPING.test(el.tagName) || el.isContentEditable);
}

export function useKeyboard(handlers) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Escape is the one key that should work while typing - it means "back out".
      if (e.key === 'Escape') {
        if (handlers.escape?.(e) !== false) return;
      }
      if (isTyping(e.target)) return;

      if (e.key >= '1' && e.key <= '9') {
        handlers.digit?.(Number(e.key) - 1);
        e.preventDefault();
        return;
      }
      if (e.key === '?') {
        handlers.help?.();
        e.preventDefault();
        return;
      }
      if (e.key === '/') {
        handlers.search?.();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}

/** Pages call this to claim `/`. Returns a cleanup. */
const focusTargets = new Set();
export function registerFocusTarget(ref) {
  focusTargets.add(ref);
  return () => focusTargets.delete(ref);
}
export function focusRegistered() {
  for (const ref of focusTargets) {
    if (ref.current) {
      ref.current.focus();
      ref.current.select?.();
      return true;
    }
  }
  return false;
}
