'use client';

import Link from 'next/link';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { cn } from '@/lib/utils';
import { DESTINATIONS, searchHref } from './destinations';

const COUNT = DESTINATIONS.length;
/** Degrees between two neighbouring cards on the bowl. */
const STEP = 34;
/**
 * How far the bowl reaches sideways (% of the box width) and how far its sides rise (% of height).
 * Narrow boxes reach further, so the side cards peek out from behind the front one to be tapped.
 */
const REACH_X = 40;
const REACH_X_NARROW = 60;
const NARROW_PX = 520;
const RISE_Y = 52;
/** Where the front card's bottom edge sits, as % of the box height. */
const FLOOR = 97;
const SWING_MS = 1250;
const SWING_DELAY_MS = 240;
const FLIGHT_MS = 1300;
/** The plane's ∩ arc, the bowl turned over: it starts and ends at 34% and peaks near the top. */
const FLIGHT_EDGE_Y = 34;
const FLIGHT_CONTROL_Y = -22;

// The cards fade out toward the box's sides and top instead of being cut off there.
const FEATHER = {
  maskImage:
    'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, transparent, #000 12%)',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
} as const;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A card's place relative to the front, wrapped into (-COUNT/2, COUNT/2]. */
function wrap(offset: number): number {
  let value = offset % COUNT;
  if (value > COUNT / 2) value -= COUNT;
  if (value <= -COUNT / 2) value += COUNT;
  return value;
}

/** Puts one card on the bowl: the further from the front, the higher, smaller and more tilted. */
function place(card: HTMLElement, offset: number, reach: number) {
  const angle = (offset * STEP * Math.PI) / 180;
  const distance = Math.abs(offset);
  card.style.left = `${50 + Math.sin(angle) * reach}%`;
  card.style.top = `${FLOOR - (1 - Math.cos(angle)) * RISE_Y}%`;
  card.style.transform = `translate(-50%, -100%) rotate(${offset * 13}deg) scale(${1 - 0.19 * distance})`;
  card.style.zIndex = String(100 - Math.round(distance * 10));
  const opacity = clamp(1 - (distance - 2) * 1.6, 0, 1);
  card.style.opacity = String(opacity);
  // A card out of sight stays in the accessibility tree (all six are destinations), but leaves the
  // tab order and cannot be clicked.
  card.style.pointerEvents = opacity === 0 ? 'none' : '';
  card.querySelector('button')?.setAttribute('tabindex', opacity === 0 ? '-1' : '0');
}

/** A point on the plane's quadratic arc and the direction it points there, in % of the box. */
function flightPoint(progress: number, direction: 1 | -1) {
  const start = direction > 0 ? -8 : 108;
  const end = direction > 0 ? 108 : -8;
  const u = 1 - progress;
  const x = u * u * start + 2 * u * progress * 50 + progress * progress * end;
  const y =
    u * u * FLIGHT_EDGE_Y +
    2 * u * progress * FLIGHT_CONTROL_Y +
    progress * progress * FLIGHT_EDGE_Y;
  const dx = 2 * u * (50 - start) + 2 * progress * (end - 50);
  const dy =
    2 * u * (FLIGHT_CONTROL_Y - FLIGHT_EDGE_Y) + 2 * progress * (FLIGHT_EDGE_Y - FLIGHT_CONTROL_Y);
  return { x, y, dx, dy, start, end };
}

const noSubscription = () => () => {};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The landing page's picture book: six destinations on a bowl-shaped arc. Choosing one swings
 * every card along the arc until it is at the front, while a small plane crosses above on the
 * arc turned over. With reduced motion the front simply changes.
 */
export function DestinationBook() {
  const [front, setFront] = useState(0);
  const [flying, setFlying] = useState(false);
  // False in the server HTML, true once hydrated: tests use it to know the cards now respond.
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const plane = useRef<HTMLDivElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const reveal = useRef<SVGRectElement>(null);
  const position = useRef(0);
  const frame = useRef<number | null>(null);

  const layout = useCallback((at: number) => {
    const width = box.current?.getBoundingClientRect().width ?? 0;
    const reach = width > 0 && width < NARROW_PX ? REACH_X_NARROW : REACH_X;
    cards.current.forEach((card, index) => card && place(card, wrap(index - at), reach));
  }, []);

  useLayoutEffect(() => {
    layout(position.current);
    // Re-place on resize, e.g. turning a phone, so the reach follows the box.
    const observer = new ResizeObserver(() => layout(position.current));
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [layout]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const go = useCallback(
    (target: number) => {
      const next = ((target % COUNT) + COUNT) % COUNT;
      const from = position.current;
      const delta = wrap(next - from);
      setFront(next);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (Math.abs(delta) < 0.001) return;

      if (reducedMotion()) {
        position.current = next;
        layout(next);
        setFlying(false);
        return;
      }

      const direction: 1 | -1 = delta > 0 ? -1 : 1;
      const rect = box.current?.getBoundingClientRect();
      const aspect = rect ? rect.width / rect.height : 1;
      const { start, end } = flightPoint(0, direction);
      trail.current?.setAttribute(
        'd',
        `M${start} ${FLIGHT_EDGE_Y} Q50 ${FLIGHT_CONTROL_Y} ${end} ${FLIGHT_EDGE_Y}`,
      );
      setFlying(true);
      const began = performance.now();

      const tick = (now: number) => {
        const elapsed = now - began;
        const flight = clamp(elapsed / FLIGHT_MS, 0, 1);
        const swing = easeInOut(clamp((elapsed - SWING_DELAY_MS) / SWING_MS, 0, 1));
        position.current = from + delta * swing;
        layout(position.current);

        const point = flightPoint(easeInOut(flight), direction);
        if (plane.current) {
          const heading = (Math.atan2(point.dy, point.dx * aspect) * 180) / Math.PI;
          plane.current.style.left = `${point.x}%`;
          plane.current.style.top = `${point.y}%`;
          plane.current.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
        }
        if (reveal.current) {
          const left = direction > 0 ? Math.min(point.start, point.x) : point.x;
          reveal.current.setAttribute('x', String(left));
          reveal.current.setAttribute('width', String(Math.abs(point.x - point.start)));
        }

        if (elapsed < SWING_DELAY_MS + SWING_MS) {
          frame.current = requestAnimationFrame(tick);
        } else {
          position.current = next;
          layout(next);
          frame.current = null;
          setFlying(false);
        }
      };
      frame.current = requestAnimationFrame(tick);
    },
    [layout],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (front + (event.key === 'ArrowRight' ? 1 : -1) + COUNT) % COUNT;
    go(next);
    buttons.current[next]?.focus();
  };

  const current = DESTINATIONS[front];

  return (
    <section
      aria-label="Where aeron flies"
      aria-roledescription="carousel"
      data-ready={ready}
      className="flex flex-col gap-4"
    >
      <div
        ref={box}
        onKeyDown={onKeyDown}
        style={FEATHER}
        className="relative aspect-[335/300] w-full overflow-hidden sm:aspect-[680/560]"
      >
        {DESTINATIONS.map((destination, index) => {
          const { Scene } = destination;
          const isFront = index === front;
          return (
            <div
              key={destination.code}
              ref={(node) => {
                cards.current[index] = node;
              }}
              data-front={isFront}
              className="group absolute w-[62%] origin-bottom opacity-0 sm:w-[46%]"
            >
              <div className="relative flex flex-col gap-2 rounded-[22px] bg-navy p-2 shadow-[0_28px_50px_-24px_rgb(7_45_80/0.55)] sm:p-2.5">
                <button
                  ref={(node) => {
                    buttons.current[index] = node;
                  }}
                  type="button"
                  aria-label={`${destination.city}, ${destination.country}`}
                  aria-current={isFront ? 'true' : undefined}
                  onClick={() => go(index)}
                  className="absolute inset-0 z-10 cursor-pointer rounded-[22px] focus-visible:outline-pink"
                />
                <div aria-hidden="true" className="aspect-[4/3] overflow-hidden rounded-[15px]">
                  <Scene />
                </div>
                <div
                  aria-hidden="true"
                  className="flex items-end justify-between gap-2 px-2 pt-1 pb-2"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] leading-none font-bold text-teal">
                      {String(index + 1).padStart(2, '0')} / {destination.country.toUpperCase()}
                    </p>
                    <p className="mt-1.5 truncate text-[clamp(1rem,2.2vw,1.55rem)] leading-none font-extrabold text-white uppercase">
                      {destination.city}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-medium text-mist">
                      {destination.landmark}
                    </p>
                  </div>
                </div>
                <Link
                  href={searchHref(destination)}
                  aria-label={`See flights to ${destination.city}`}
                  tabIndex={isFront ? 0 : -1}
                  aria-hidden={isFront ? undefined : true}
                  className={cn(
                    'absolute right-3 bottom-3 z-20 grid size-11 place-items-center rounded-full bg-pink text-xl font-bold text-navy transition-[opacity,transform] duration-300 hover:rotate-45 focus-visible:outline-white sm:size-12',
                    isFront && !flying
                      ? 'opacity-100 delay-300'
                      : 'pointer-events-none scale-75 opacity-0',
                  )}
                >
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
          );
        })}

        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={cn(
            'pointer-events-none absolute inset-0 z-[150] h-full w-full overflow-visible transition-opacity duration-700',
            flying ? 'opacity-100' : 'opacity-0',
          )}
        >
          <defs>
            <clipPath id="book-trail-reveal">
              <rect ref={reveal} x="0" y="-40" width="0" height="140" />
            </clipPath>
          </defs>
          <path
            ref={trail}
            d=""
            clipPath="url(#book-trail-reveal)"
            fill="none"
            stroke="var(--color-navy)"
            strokeWidth="2"
            strokeDasharray="2 7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          ref={plane}
          data-testid="book-plane"
          data-flying={flying}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute z-[160] w-9 sm:w-11',
            flying ? 'block' : 'hidden',
          )}
        >
          <Plane />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p role="status" className="sr-only">
          Now showing {current.city}, {current.country}
        </p>
        <p aria-hidden="true" className="text-sm font-bold text-navy">
          {current.landmark} · <span className="text-navy-soft">{current.city}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous destination"
            onClick={() => go(front - 1)}
            className="grid size-11 cursor-pointer place-items-center rounded-full border border-navy/20 bg-white text-lg font-bold text-navy hover:border-navy focus-visible:outline-pink"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            aria-label="Next destination"
            onClick={() => go(front + 1)}
            className="grid size-11 cursor-pointer place-items-center rounded-full bg-navy text-lg font-bold text-white hover:bg-navy-soft focus-visible:outline-pink"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

/** A small airliner seen from above, nose pointing right. */
function Plane() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="block h-auto w-full drop-shadow-[0_6px_6px_rgb(7_45_80/0.35)]"
    >
      <path
        d="M44 24c0-1.6-1.4-2.6-3.2-2.6H30.6L19.8 6.2h-4.6l5.6 15.2H11.2L7.6 15.6H4l2.2 8.4L4 32.4h3.6l3.6-5.8h9.6L15.2 41.8h4.6l10.8-15.2h10.2c1.8 0 3.2-1 3.2-2.6z"
        fill="var(--color-navy)"
      />
      <path d="M31 22.4h9.6c.9 0 1.6.7 1.6 1.6s-.7 1.6-1.6 1.6H31z" fill="var(--color-pink)" />
    </svg>
  );
}
