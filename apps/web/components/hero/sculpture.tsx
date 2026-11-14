'use client';

import dynamic from 'next/dynamic';
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { cn } from '@/lib/utils';

// three.js is only downloaded on the landing page, and only in the browser.
const Scene = dynamic(() => import('./scene'), { ssr: false });

const POSTER = '/aeron/hero-chrome.png';

// The artwork's backdrop is a hair darker than the page; feather its edges so no seam shows.
const EDGE_FEATHER = {
  maskImage:
    'linear-gradient(to right, transparent, #000 3%, #000 97%, transparent), linear-gradient(to bottom, transparent, #000 3%, #000 97%, transparent)',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
} as const;

function canUse3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

const noop = () => () => {};

/** Shows the poster instead if the 3D scene throws (lost context, blocked GPU). */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The landing page's chrome sculpture. The still image is what the server sends; the browser swaps
 * in the real-time model once it has loaded, unless motion is reduced or WebGL is missing.
 */
export function HeroSculpture() {
  // false on the server and during hydration, the real answer right after.
  const capable = useSyncExternalStore(noop, canUse3D, () => false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const use3D = capable && !failed;
  // Stable, because the scene loads its model in an effect that depends on them.
  const markReady = useCallback(() => setReady(true), []);
  const markFailed = useCallback(() => setFailed(true), []);

  // Stop rendering frames while the hero is off screen or the tab is in the background.
  useEffect(() => {
    const element = box.current;
    if (!element || !use3D) return;
    let inView = true;
    const update = () => setActive(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? true;
        update();
      },
      { rootMargin: '120px' },
    );
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [use3D]);

  return (
    <div
      ref={box}
      role="img"
      aria-label="Liquid-chrome sculpture in teal, navy and crimson"
      data-hero-mode={use3D ? (ready ? '3d' : 'loading') : 'static'}
      className="relative aspect-[680/588] w-full"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local poster, masked with CSS */}
      <img
        src={POSTER}
        alt=""
        width={680}
        height={588}
        style={EDGE_FEATHER}
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-700',
          use3D && ready && 'opacity-0',
        )}
      />
      {use3D && (
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-700',
            ready ? 'opacity-100' : 'opacity-0',
          )}
        >
          <SceneBoundary onError={markFailed}>
            <Scene active={active} onReady={markReady} onUnavailable={markFailed} />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
