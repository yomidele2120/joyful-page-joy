import { useEffect, useState } from 'react';

// Tracks the part of the screen a full-screen chat can really use. On phones the on-screen keyboard covers the bottom of
// the page without resizing it, so the chat follows the "visual viewport" to keep the message box above the keyboard.

export const isKeyboardOpen = (visibleHeight: number, layoutHeight: number) => layoutHeight - visibleHeight > 120;

export interface ChatViewport { mobile: boolean; top: number; height: number; keyboardOpen: boolean }

const read = (): ChatViewport => {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const layout = typeof window !== 'undefined' ? window.innerHeight : 800;
  const height = Math.round(vv?.height ?? layout);
  return {
    mobile: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
    top: Math.round(vv?.offsetTop ?? 0),
    height,
    keyboardOpen: isKeyboardOpen(height, layout),
  };
};

export function useChatViewport(): ChatViewport {
  const [state, setState] = useState<ChatViewport>(read);
  useEffect(() => {
    const update = () => setState((prev) => {
      const next = read();
      return prev.mobile === next.mobile && prev.top === next.top && prev.height === next.height && prev.keyboardOpen === next.keyboardOpen ? prev : next;
    });
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update); window.addEventListener('orientationchange', update);
    update();
    return () => {
      vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update);
    };
  }, []);
  return state;
}
