import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useChatViewport } from '@/hooks/useChatViewport';

interface Props {
  /** Top bar: back button, avatar, name, call buttons. */
  header: ReactNode;
  /** Bottom area: message box (and anything pinned above it). */
  footer: ReactNode;
  /** The messages. */
  children: ReactNode;
  /** Extra classes used only on larger screens (where the chat sits inside the page instead of covering it). */
  desktopClassName?: string;
}

// One frame for every chat screen. On a phone the chat takes over the whole screen, like a messaging app: a fixed top bar,
// messages that scroll on their own, and the message box pinned at the bottom above the keyboard and the home bar. The page
// behind it cannot scroll. On tablets and computers it simply fills the space it is given.
export default function ChatShell({ header, footer, children, desktopClassName = '' }: Props) {
  const { mobile, top, height, keyboardOpen } = useChatViewport();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);   // is the reader at the bottom? then keep them there when the keyboard opens or the screen changes

  // Stop the page behind the chat from scrolling while the chat covers the screen.
  useEffect(() => {
    if (!mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobile]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [height, keyboardOpen]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

  return (
    <div
      className={mobile ? 'fixed inset-x-0 z-[55] flex flex-col bg-background' : `relative flex h-full min-h-0 flex-col bg-background ${desktopClassName}`}
      style={mobile ? { top, height } : undefined}
    >
      <div className="shrink-0 border-b border-border bg-card pt-[env(safe-area-inset-top)] md:pt-0">{header}</div>
      <div ref={bodyRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-secondary/30 px-3 py-3 md:space-y-3 md:px-4">
        {children}
      </div>
      <div className={`shrink-0 border-t border-border bg-card ${keyboardOpen ? '' : 'pb-[env(safe-area-inset-bottom)]'} md:pb-0`}>{footer}</div>
    </div>
  );
}
