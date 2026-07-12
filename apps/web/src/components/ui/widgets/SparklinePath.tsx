import { TONE_TEXT, type WidgetTone } from "./tone";

export interface SparklinePathProps {
  label: string;
  value: string;
  /** Raw values, oldest first. Needs at least 2 points to draw a line. */
  points: number[];
  tone?: WidgetTone;
}

const WIDTH = 64;
const HEIGHT = 24;

/** A trend read as a literal line, not a number alone - lets the direction register at a glance. */
export function SparklinePath({ label, value, points, tone = "accent" }: SparklinePathProps) {
  const hasTrend = points.length >= 2;
  const min = hasTrend ? Math.min(...points) : 0;
  const max = hasTrend ? Math.max(...points) : 1;
  const range = max - min || 1;

  const path = hasTrend
    ? points
        .map((point, index) => {
          const x = (index / (points.length - 1)) * WIDTH;
          const y = HEIGHT - ((point - min) / range) * HEIGHT;
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";

  const lastPoint = hasTrend
    ? { x: WIDTH, y: HEIGHT - ((points[points.length - 1] - min) / range) * HEIGHT }
    : null;

  return (
    <div className="min-w-[104px]">
      <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={`font-mono text-lg font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
        {hasTrend && (
          <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={TONE_TEXT[tone]} aria-hidden="true">
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
            {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="2.2" fill="currentColor" />}
          </svg>
        )}
      </div>
    </div>
  );
}
