import { useId } from "react";

interface Props {
  readonly values: ReadonlyArray<number>;
  readonly labels?: ReadonlyArray<string>;
  readonly ariaLabel: string;
  readonly yMax?: number;
  readonly height?: number;
}

export function TrendChart({ values, labels, ariaLabel, yMax, height = 120 }: Props) {
  const id = useId();
  const w = 600;
  const h = height;
  const pad = 24;
  const n = values.length;

  if (n === 0) {
    return <div className="text-sm text-ink-500 dark:text-ink-400 italic">No data yet.</div>;
  }

  const max = yMax ?? Math.max(...values, 1);
  const step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const points = values.map((v, i) => `${pad + i * step},${y(v)}`).join(" ");

  const areaPath =
    n > 1
      ? `M ${pad},${h - pad} L ${points.split(" ").join(" L ")} L ${pad + (n - 1) * step},${h - pad} Z`
      : "";

  const labelStride = Math.ceil(n / 6);

  return (
    <figure aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto"
        role="img"
        aria-labelledby={id}
      >
        <title id={id}>{ariaLabel}</title>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A6192E" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#A6192E" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={pad}
            x2={w - pad}
            y1={h - pad - frac * (h - pad * 2)}
            y2={h - pad - frac * (h - pad * 2)}
            stroke="#e7e5e4"
            strokeWidth={1}
          />
        ))}

        {n > 1 && (
          <>
            <path d={areaPath} fill={`url(#grad-${id})`} />
            <polyline
              points={points}
              fill="none"
              stroke="#A6192E"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {values.map((v, i) => (
          <circle key={i} cx={pad + i * step} cy={y(v)} r={3} fill="#A6192E" />
        ))}

        {labels?.map((l, i) =>
          i % labelStride === 0 || i === n - 1 ? (
            <text
              key={i}
              x={pad + i * step}
              y={h - 6}
              fontSize={10}
              textAnchor="middle"
              fill="#78716c"
            >
              {l}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}
