import { lazy, Suspense, useMemo } from 'react';
const DukaScene = lazy(() => import('./DukaScene'));

function canRun3D() {
  if (typeof window === 'undefined') return false;
  if ((navigator.hardwareConcurrency ?? 2) <= 4) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
/** Static fallback: the same storefront as flat SVG, so low-end phones still get the identity. */
export function DukaIllustration({ height = 240 }: { height?: number }) {
  return (
    <svg viewBox="0 0 360 240" style={{ height, width: '100%' }} aria-hidden>
      <rect x="40" y="70" width="280" height="150" rx="10" fill="var(--s2)" />
      {[0, 1, 2].map(r => <g key={r}><rect x="56" y={96 + r * 38} width="248" height="4" fill="#6B4A2E" />{Array.from({ length: 9 }, (_, i) => <rect key={i} x={62 + i * 27} y={96 + r * 38 - 14 - ((i * 7 + r * 3) % 4) * 3} width="20" height={14 + ((i * 7 + r * 3) % 4) * 3} rx="3" fill={['#D9480F', '#F5A623', '#1F8A5B', '#C4502C', '#FAF6EF', '#3E7CB1'][(i + r * 2) % 6]} />)}</g>)}
      <rect x="30" y="186" width="300" height="40" rx="6" fill="#FAF6EF" />
      <path d="M24 70 L336 70 L316 36 L44 36 Z" fill="#D9480F" />
      {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${24 + i * 24} 70 a12 12 0 0 0 24 0`} fill={i % 2 ? '#F5A623' : '#D9480F'} />)}
    </svg>
  );
}
export function Hero3D({ height = 260 }: { height?: number }) {
  const ok = useMemo(canRun3D, []);
  if (!ok) return <DukaIllustration height={height} />;
  return <Suspense fallback={<DukaIllustration height={height} />}><DukaScene height={height} /></Suspense>;
}
