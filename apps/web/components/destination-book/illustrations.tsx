// Six picture-book scenes, drawn as flat SVG in the aeron palette. They are decoration: each card
// already names its city, so every drawing is hidden from screen readers.
import type { ReactNode } from 'react';

const NAVY = '#072d50';
const NAVY_SOFT = '#0c4676';
const PINK = '#fe5c8d';
const TEAL = '#dbf2fc';
const MIST = '#8fc9e0';
const ICE = '#f4fbff';
const LINE = '#b5d8e9';
const BLUSH = '#ffe0ea';

function Scene({
  id,
  top,
  bottom,
  children,
}: {
  id: string;
  top: string;
  bottom: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 320 240" aria-hidden="true" focusable="false" className="block h-full w-full">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill={`url(#${id}-sky)`} />
      {children}
    </svg>
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={ICE}>
      <ellipse cx="0" cy="0" rx="22" ry="9" />
      <ellipse cx="-12" cy="-5" rx="12" ry="9" />
      <ellipse cx="9" cy="-8" rx="14" ry="11" />
    </g>
  );
}

/** One torii: two pillars, the lower beam (nuki) and the curved top beam (kasagi) with its cap. */
function Torii({
  cx,
  base,
  s,
  opacity = 1,
}: {
  cx: number;
  base: number;
  s: number;
  opacity?: number;
}) {
  const w = 150 * s;
  const h = 128 * s;
  const top = base - h;
  const pillar = 10 * s;
  const px = w * 0.3;
  return (
    <g opacity={opacity}>
      <rect
        x={cx - px - pillar / 2}
        y={top + 8 * s}
        width={pillar}
        height={h - 8 * s}
        fill={PINK}
      />
      <rect
        x={cx + px - pillar / 2}
        y={top + 8 * s}
        width={pillar}
        height={h - 8 * s}
        fill={PINK}
      />
      <rect x={cx - w * 0.4} y={top + h * 0.24} width={w * 0.8} height={7 * s} fill={PINK} />
      <path
        d={`M${cx - w * 0.56} ${top - 4 * s} Q${cx} ${top + 9 * s} ${cx + w * 0.56} ${top - 4 * s} L${cx + w * 0.5} ${top + 9 * s} Q${cx} ${top + 19 * s} ${cx - w * 0.5} ${top + 9 * s} Z`}
        fill={PINK}
      />
      <path
        d={`M${cx - w * 0.6} ${top - 9 * s} Q${cx} ${top + 3 * s} ${cx + w * 0.6} ${top - 9 * s} L${cx + w * 0.56} ${top - 3 * s} Q${cx} ${top + 8 * s} ${cx - w * 0.56} ${top - 3 * s} Z`}
        fill={NAVY}
      />
      <rect x={cx - 3 * s} y={top + 6 * s} width={6 * s} height={h * 0.2} fill={NAVY} />
    </g>
  );
}

export function TokyoScene() {
  return (
    <Scene id="tokyo" top={TEAL} bottom={BLUSH}>
      <circle cx="248" cy="62" r="30" fill={PINK} opacity="0.85" />
      <Cloud x={70} y={48} s={0.9} />
      <path d="M0 168 Q60 132 120 150 T240 140 T320 150 V240 H0Z" fill={MIST} opacity="0.7" />
      <path d="M0 200 L320 200 V240 H0Z" fill={NAVY_SOFT} />
      <path d="M120 240 L152 200 H168 L200 240Z" fill={LINE} opacity="0.55" />
      {[0.2, 0.28, 0.4, 0.56, 0.78, 1.08].map((s, index) => (
        <Torii key={s} cx={160} base={200 + 40 * (s - 0.2)} s={s} opacity={0.55 + index * 0.09} />
      ))}
    </Scene>
  );
}

export function ParisScene() {
  return (
    <Scene id="paris" top={ICE} bottom={BLUSH}>
      <circle cx="72" cy="150" r="34" fill={PINK} opacity="0.8" />
      <Cloud x={250} y={50} />
      <Cloud x={80} y={70} s={0.7} />
      <g fill={NAVY}>
        <path fillRule="evenodd" d="M108 214 L139 148 H181 L212 214 H192 Q160 172 128 214 Z" />
        <rect x="128" y="143" width="64" height="8" rx="2" />
        <path d="M141 145 L149 98 H171 L179 145 Z" />
        <rect x="142" y="94" width="36" height="6" rx="2" />
        <path d="M150 96 L157 34 H163 L170 96 Z" />
        <rect x="155" y="28" width="10" height="8" rx="2" />
        <rect x="159" y="12" width="2" height="18" />
      </g>
      <g stroke={LINE} strokeWidth="1.2" opacity="0.6">
        <path d="M147 152 L171 140 M149 140 L175 152 M152 102 L168 120 M168 102 L152 120 M156 50 L164 70 M164 50 L156 70" />
      </g>
      <path d="M0 214 Q80 204 160 214 T320 210 V240 H0Z" fill={NAVY_SOFT} />
      <g fill={MIST}>
        <circle cx="34" cy="212" r="14" />
        <circle cx="58" cy="216" r="11" />
        <circle cx="262" cy="212" r="14" />
        <circle cx="288" cy="214" r="12" />
      </g>
    </Scene>
  );
}

export function CairoScene() {
  return (
    <Scene id="cairo" top={TEAL} bottom={BLUSH}>
      <circle cx="232" cy="92" r="40" fill={PINK} opacity="0.85" />
      <Cloud x={70} y={44} s={0.8} />
      <path d="M0 180 Q90 168 170 178 T320 172 V240 H0Z" fill={LINE} opacity="0.7" />
      <path d="M44 196 L104 118 L164 196 Z" fill={NAVY_SOFT} />
      <path d="M104 118 L164 196 H128 Z" fill={NAVY} opacity="0.55" />
      <path d="M118 206 L196 96 L274 206 Z" fill={NAVY} />
      <path d="M196 96 L274 206 H226 Z" fill={NAVY_SOFT} />
      <path d="M232 210 L262 170 L292 210 Z" fill={NAVY} />
      <path d="M262 170 L292 210 H276 Z" fill={NAVY_SOFT} />
      <g stroke={LINE} strokeWidth="1" opacity="0.35">
        <path d="M150 160 H242 M135 182 H257 M166 136 H226 M180 116 H212" />
      </g>
      <path d="M0 204 Q100 192 200 204 T320 200 V240 H0Z" fill={ICE} />
      <path d="M0 222 Q120 212 220 222 T320 220 V240 H0Z" fill={LINE} opacity="0.6" />
      <g fill={NAVY}>
        <rect x="32" y="166" width="4" height="40" rx="2" />
        <path d="M34 166 q-18 -4 -26 8 q14 -8 26 -6 q-10 -12 -24 -10 q16 -2 24 6 q6 -14 22 -14 q-14 6 -22 16 q16 -8 26 2 q-14 -6 -26 -2Z" />
      </g>
    </Scene>
  );
}

export function RomeScene() {
  const arches = [];
  // The drum's top rim bulges up toward the middle; each arch follows that curve.
  const lift = (x: number) => -15 * (1 - ((x - 160) / 100) ** 2);
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 9; i += 1) {
      const x = 70 + i * 21;
      if (row === 0 && i > 6) continue;
      arches.push(
        <rect
          key={`${row}-${i}`}
          x={x}
          y={126 + row * 26 + lift(x + 6)}
          width="12"
          height="18"
          rx="6"
          fill={row === 0 ? TEAL : ICE}
          opacity={row === 0 ? 0.9 : 0.75}
        />,
      );
    }
  }
  return (
    <Scene id="rome" top={TEAL} bottom={ICE}>
      <circle cx="74" cy="64" r="28" fill={PINK} opacity="0.85" />
      <Cloud x={238} y={52} />
      <path d="M60 204 V112 Q160 80 260 112 V204 Q160 218 60 204 Z" fill={NAVY_SOFT} />
      <path d="M60 116 V104 Q130 78 214 92 L214 104 Q130 90 60 116 Z" fill={NAVY} />
      <path
        d="M214 92 L226 104 L236 98 L246 112 L260 110 V122 Q238 112 214 108 Z"
        fill={NAVY}
        opacity="0.8"
      />
      {arches}
      <path d="M60 172 Q160 184 260 172" stroke={NAVY} strokeWidth="3" fill="none" />
      <path d="M60 146 Q160 158 260 146" stroke={NAVY} strokeWidth="3" fill="none" />
      <path d="M0 206 Q160 218 320 206 V240 H0Z" fill={MIST} />
      <path d="M0 224 Q160 232 320 222 V240 H0Z" fill={NAVY} opacity="0.85" />
    </Scene>
  );
}

export function BeijingScene() {
  const ridge = 'M-4 176 L70 140 L122 160 L178 114 L232 140 L324 102';
  return (
    <Scene id="beijing" top={ICE} bottom={TEAL}>
      <circle cx="262" cy="56" r="26" fill={PINK} opacity="0.85" />
      <Cloud x={84} y={46} s={0.9} />
      <path
        d="M0 150 L50 104 L92 136 L148 82 L204 126 L256 90 L320 128 V240 H0Z"
        fill={MIST}
        opacity="0.55"
      />
      <path d="M-4 180 L70 144 L122 164 L178 118 L232 144 L324 106 V240 H-4Z" fill={LINE} />
      <path d="M0 214 Q90 186 170 206 T320 196 V240 H0Z" fill={NAVY_SOFT} />
      <path d={ridge} stroke={NAVY} strokeWidth="11" strokeLinejoin="round" fill="none" />
      <path
        d={ridge}
        transform="translate(0 -8)"
        stroke={NAVY}
        strokeWidth="5"
        strokeDasharray="5 4"
        fill="none"
      />
      {[
        [70, 140],
        [178, 114],
        [300, 108],
      ].map(([x, y]) => (
        <g key={x}>
          <rect x={x - 12} y={y - 30} width="24" height="28" fill={NAVY} />
          <rect x={x - 15} y={y - 34} width="30" height="6" fill={NAVY} />
          <rect x={x - 4} y={y - 22} width="8" height="10" rx="4" fill={PINK} />
        </g>
      ))}
    </Scene>
  );
}

function Palm({
  x,
  base,
  h,
  flip = false,
}: {
  x: number;
  base: number;
  h: number;
  flip?: boolean;
}) {
  const lean = flip ? -18 : 18;
  const tipX = x + lean;
  const tipY = base - h;
  const fronds = [-150, -115, -70, -35, 10, 40].map((angle) => {
    const radians = (angle * Math.PI) / 180;
    const length = 34;
    const ex = tipX + Math.cos(radians) * length;
    const ey = tipY + Math.sin(radians) * length + 10;
    const cx = tipX + Math.cos(radians) * length * 0.5;
    const cy = tipY + Math.sin(radians) * length * 0.5 - 8;
    return `M${tipX} ${tipY} Q${cx} ${cy} ${ex} ${ey}`;
  });
  return (
    <g>
      <path
        d={`M${x} ${base} Q${x + lean * 0.2} ${base - h / 2} ${tipX} ${tipY}`}
        stroke={NAVY}
        strokeWidth="5"
        fill="none"
      />
      {fronds.map((d) => (
        <path key={d} d={d} stroke={NAVY} strokeWidth="6" strokeLinecap="round" fill="none" />
      ))}
    </g>
  );
}

export function LosAngelesScene() {
  return (
    <Scene id="la" top={TEAL} bottom={BLUSH}>
      <clipPath id="la-sun">
        <rect x="0" y="0" width="320" height="176" />
      </clipPath>
      <g clipPath="url(#la-sun)">
        <circle cx="160" cy="176" r="70" fill={PINK} />
        {[140, 152, 162, 170].map((y, index) => (
          <rect key={y} x="80" y={y} width="160" height={2 + index} fill={BLUSH} />
        ))}
      </g>
      <g fill={NAVY_SOFT}>
        <rect x="96" y="128" width="16" height="48" />
        <rect x="114" y="108" width="20" height="68" />
        <rect x="136" y="120" width="14" height="56" />
        <rect x="186" y="116" width="18" height="60" />
        <rect x="206" y="134" width="14" height="42" />
        <path d="M120 108 L124 98 L128 108Z" />
      </g>
      <path d="M0 176 H320 V240 H0Z" fill={MIST} />
      <g stroke={ICE} strokeWidth="2" opacity="0.7">
        <path d="M30 190 H90 M140 200 H230 M250 188 H300 M60 214 H120" />
      </g>
      <path d="M0 226 Q160 214 320 226 V240 H0Z" fill={NAVY} />
      <Palm x={44} base={228} h={120} />
      <Palm x={76} base={228} h={92} />
      <Palm x={282} base={228} h={110} flip />
    </Scene>
  );
}
