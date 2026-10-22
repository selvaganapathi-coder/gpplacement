/** Lightweight SVG charts — no chart library dependency. */

export type ChartDatum = {
  id: string;
  label: string;
  value: number;
  /** Optional secondary value (e.g. pass rate). */
  secondary?: number;
  tone?: "brand" | "ok" | "warn" | "danger" | "muted";
};

const TONE_FILL: Record<NonNullable<ChartDatum["tone"]>, string> = {
  brand: "url(#chartGradBrand)",
  ok: "url(#chartGradOk)",
  warn: "url(#chartGradWarn)",
  danger: "url(#chartGradDanger)",
  muted: "#a8a29e",
};

function ChartDefs() {
  return (
    <defs>
      <linearGradient id="chartGradBrand" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#991b1b" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id="chartGradOk" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#fbbf24" />
      </linearGradient>
      <linearGradient id="chartGradWarn" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#b45309" />
        <stop offset="100%" stopColor="#fcd34d" />
      </linearGradient>
      <linearGradient id="chartGradDanger" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#7f1d1d" />
        <stop offset="100%" stopColor="#e04a2f" />
      </linearGradient>
    </defs>
  );
}

function toneForPercent(n: number): NonNullable<ChartDatum["tone"]> {
  if (n < 40) return "danger";
  if (n < 60) return "warn";
  if (n < 75) return "brand";
  return "ok";
}

export function ScoreRing({
  percent,
  size = 132,
  label = "Average",
  sublabel,
}: {
  percent: number | null;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;
  const tone = percent == null ? "muted" : toneForPercent(p);
  const stroke =
    tone === "danger"
      ? "#991b1b"
      : tone === "warn"
        ? "#f59e0b"
        : tone === "ok"
          ? "#d97706"
          : tone === "muted"
            ? "#d6d3d1"
            : "#991b1b";

  return (
    <div className="chart-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="chart-ring__svg" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e7e5e4" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 50 50)"
          className="chart-ring__arc"
        />
      </svg>
      <div className="chart-ring__center">
        <p className="chart-ring__value">
          {percent == null ? "—" : `${Math.round(p)}%`}
        </p>
        <p className="chart-ring__label">{label}</p>
        {sublabel ? <p className="chart-ring__sub">{sublabel}</p> : null}
      </div>
    </div>
  );
}

export function VerticalBarChart({
  data,
  height = 200,
  valueSuffix = "%",
  emptyLabel = "No data yet",
}: {
  data: ChartDatum[];
  height?: number;
  valueSuffix?: string;
  emptyLabel?: string;
}) {
  if (!data.length) {
    return <p className="chart-empty">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = 28;
  const w = Math.max(280, data.length * 56);
  const chartH = height - 36;
  const gap = 10;
  const barW = Math.min(40, (w - pad * 2) / data.length - gap);

  return (
    <div className="chart-scroll">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="chart-svg"
        role="img"
        aria-label="Bar chart"
      >
        <ChartDefs />
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = pad + chartH - (Math.min(tick, max) / max) * chartH;
          if (tick > max && tick !== 0) return null;
          return (
            <g key={tick}>
              <line
                x1={pad}
                x2={w - 8}
                y1={y}
                y2={y}
                stroke="#e7e5e4"
                strokeDasharray="4 4"
              />
              <text x={4} y={y + 3} className="chart-axis-label">
                {tick}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * chartH;
          const x = pad + i * (barW + gap) + gap / 2;
          const y = pad + chartH - h;
          const fillTone = d.tone ?? toneForPercent(d.value);
          const fill = TONE_FILL[fillTone];
          return (
            <g key={d.id}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, h)}
                rx={6}
                fill={fill}
                className="chart-bar"
              />
              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                className="chart-value-label"
              >
                {Math.round(d.value)}
                {valueSuffix}
              </text>
              <text
                x={x + barW / 2}
                y={height - 8}
                textAnchor="middle"
                className="chart-tick-label"
              >
                {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HorizontalBarChart({
  data,
  valueSuffix = "%",
  emptyLabel = "No data yet",
}: {
  data: ChartDatum[];
  valueSuffix?: string;
  emptyLabel?: string;
}) {
  if (!data.length) {
    return <p className="chart-empty">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ul className="chart-hbar-list">
      {data.map((d) => {
        const width = Math.max(3, (d.value / max) * 100);
        const tone = d.tone ?? toneForPercent(d.value);
        return (
          <li key={d.id} className="chart-hbar">
            <div className="chart-hbar__head">
              <span className="chart-hbar__label" title={d.label}>
                {d.label}
              </span>
              <span className="chart-hbar__value">
                {Math.round(d.value * 10) / 10}
                {valueSuffix}
              </span>
            </div>
            <div className="chart-hbar__track">
              <span
                className={`chart-hbar__fill chart-hbar__fill--${tone}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DistributionBars({
  bands,
  emptyLabel = "No scores yet",
}: {
  bands: { label: string; count: number }[];
  emptyLabel?: string;
}) {
  const total = bands.reduce((s, b) => s + b.count, 0);
  if (!total) return <p className="chart-empty">{emptyLabel}</p>;

  const tones: ChartDatum["tone"][] = ["danger", "warn", "brand", "ok", "ok"];

  return (
    <div className="chart-dist">
      <div className="chart-dist__stack" role="img" aria-label="Score distribution">
        {bands.map((b, i) => {
          if (!b.count) return null;
          const pct = (b.count / total) * 100;
          return (
            <span
              key={b.label}
              className={`chart-dist__seg chart-dist__seg--${tones[i] ?? "brand"}`}
              style={{ width: `${pct}%` }}
              title={`${b.label}: ${b.count}`}
            />
          );
        })}
      </div>
      <ul className="chart-dist__legend">
        {bands.map((b, i) => (
          <li key={b.label}>
            <span className={`chart-dist__dot chart-dist__dot--${tones[i] ?? "brand"}`} />
            {b.label}
            <strong>{b.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({
  values,
  height = 56,
}: {
  values: number[];
  height?: number;
}) {
  if (values.length < 2) {
    return <p className="chart-empty">Need at least two scores for a trend.</p>;
  }
  const w = 280;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="chart-svg chart-spark"
      role="img"
      aria-label="Score trend"
    >
      <ChartDefs />
      <polyline
        fill="none"
        stroke="url(#chartGradBrand)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(" ")}
      />
      {values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = pad + (1 - (v - min) / span) * (height - pad * 2);
        return <circle key={i} cx={x} cy={y} r="3.5" fill="#991b1b" />;
      })}
    </svg>
  );
}
