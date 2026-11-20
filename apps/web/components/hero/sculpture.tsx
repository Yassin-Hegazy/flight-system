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

let webglAvailable: boolean | undefined;

function canUse3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (webglAvailable !== undefined) return webglAvailable;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    webglAvailable = gl !== null;
  } catch {
    webglAvailable = false;
  }
  return webglAvailable;
}

function subscribeMotionPreference(update: () => void) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', update);
  return () => preference.removeEventListener('change', update);
}

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

const motionLabel = (paused: boolean) =>
  paused ? 'Resume sculpture rotation' : 'Pause sculpture rotation';
const motionText = (paused: boolean) => (paused ? 'Resume motion' : 'Pause motion');

function heroMode(use3D: boolean, ready: boolean) {
  if (!use3D) return 'static';
  return ready ? '3d' : 'loading';
}

/**
 * The landing page's chrome sculpture. The still image is what the server sends; the browser swaps
 * in the real-time model once it has loaded, unless motion is reduced or WebGL is missing.
 */
export function HeroSculpture() {
  // false on the server and during hydration, the real answer right after.
  const capable = useSyncExternalStore(subscribeMotionPreference, canUse3D, () => false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [paused, setPaused] = useState(false);
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
      role="group"
      aria-label="Liquid-chrome sculpture in teal, navy and crimson"
      data-hero-mode={heroMode(use3D, ready)}
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
            <Scene active={active && !paused} onReady={markReady} onUnavailable={markFailed} />
          </SceneBoundary>
        </div>
      )}
      {use3D && ready && (
        <button
          type="button"
          aria-label={motionLabel(paused)}
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="absolute right-4 bottom-2 z-10 rounded-full border border-navy/20 bg-teal/90 px-4 py-2 text-xs font-medium text-navy hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy"
        >
          {motionText(paused)}
        </button>
      )}
    </div>
  );
}
