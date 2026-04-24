import {useMemo} from "react";

export interface AustriaHospital {
    readonly name: string;
    readonly city: string;
    readonly lat: number;
    readonly lng: number;
    readonly aqi: number;
}

interface Props {
    readonly hospitals: ReadonlyArray<AustriaHospital>;
    readonly onSelect: (h: AustriaHospital) => void;
    readonly selectedName?: string;
}

// Smoothed Austria outline, clockwise from NW.
const OUTLINE: ReadonlyArray<readonly [number, number]> = [
    [47.55, 9.55], [47.46, 9.70], [47.24, 9.60], [47.05, 10.05],
    [46.95, 10.48], [46.78, 10.50], [46.88, 11.02], [46.77, 11.28],
    [46.95, 11.88], [46.83, 12.20], [46.65, 12.95], [46.62, 13.45],
    [46.50, 13.72], [46.42, 14.58], [46.50, 15.00], [46.62, 15.65],
    [46.85, 16.10], [47.00, 16.45], [47.40, 16.45], [47.68, 16.50],
    [47.76, 16.85], [48.06, 17.16], [48.45, 16.95], [48.80, 16.95],
    [48.78, 15.73], [48.97, 14.95], [48.77, 13.82], [48.57, 13.45],
    [48.22, 13.00], [47.95, 12.80], [47.68, 12.20], [47.58, 11.98],
    [47.45, 11.60], [47.55, 10.92], [47.57, 10.48], [47.50, 10.07],
    [47.55, 9.55],
];

const LAT_MIN = 46.3;
const LAT_MAX = 49.1;
const LNG_MIN = 9.35;
const LNG_MAX = 17.3;
const W = LNG_MAX - LNG_MIN;
const H = LAT_MAX - LAT_MIN;
const CLUSTER_RADIUS_DEG = 0.25;

function project(lat: number, lng: number): readonly [number, number] {
    return [lng - LNG_MIN, LAT_MAX - lat];
}

type Aqi = "good" | "moderate" | "unhealthy-sensitive" | "unhealthy";

function aqiBucket(aqi: number): Aqi {
    if (aqi <= 50) return "good";
    if (aqi <= 100) return "moderate";
    if (aqi <= 150) return "unhealthy-sensitive";
    return "unhealthy";
}

const BUCKET_STROKE: Record<Aqi, string> = {
    good: "#10b981",
    moderate: "#f59e0b",
    "unhealthy-sensitive": "#f97316",
    unhealthy: "#e11d48",
};

const BUCKET_FILL: Record<Aqi, string> = {
    good: "#10b98133",
    moderate: "#f59e0b33",
    "unhealthy-sensitive": "#f9731633",
    unhealthy: "#e11d4833",
};

interface Cluster {
    readonly lat: number;
    readonly lng: number;
    readonly aqi: number;
    readonly members: ReadonlyArray<AustriaHospital>;
    readonly label: string;
}

function buildClusters(hospitals: ReadonlyArray<AustriaHospital>): ReadonlyArray<Cluster> {
    const used = new Set<number>();
    const out: Cluster[] = [];
    hospitals.forEach((h, i) => {
        if (used.has(i)) return;
        const group: AustriaHospital[] = [h];
        used.add(i);
        hospitals.forEach((other, j) => {
            if (used.has(j)) return;
            if (Math.hypot(h.lat - other.lat, h.lng - other.lng) <= CLUSTER_RADIUS_DEG) {
                group.push(other);
                used.add(j);
            }
        });
        const avgLat = group.reduce((s, m) => s + m.lat, 0) / group.length;
        const avgLng = group.reduce((s, m) => s + m.lng, 0) / group.length;
        const commonCity = group[0]!.city;
        const allSameCity = group.every((m) => m.city === commonCity);
        out.push({
            lat: avgLat,
            lng: avgLng,
            aqi: Math.max(...group.map((m) => m.aqi)),
            members: group,
            label: allSameCity && group.length > 1 ? commonCity : group[0]!.name,
        });
    });
    return out;
}

// East clusters flip label to the left so text never runs off the map.
function labelPlacement(
    cx: number,
    cy: number,
): { readonly tx: number; readonly ty: number; readonly anchor: "start" | "end" } {
    const eastHalf = cx > W / 2;
    return {
        tx: cx + (eastHalf ? -0.25 : 0.25),
        ty: cy + 0.04,
        anchor: eastHalf ? "end" : "start",
    };
}

export function AustriaMap({hospitals, onSelect, selectedName}: Props) {
    const clusters = useMemo(() => buildClusters(hospitals), [hospitals]);

    const outlinePath =
        OUTLINE.map(([lat, lng], i) => {
            const [x, y] = project(lat, lng);
            return `${i === 0 ? "M" : "L"} ${x.toFixed(3)},${y.toFixed(3)}`;
        }).join(" ") + " Z";

    // Cluster click selects the worst-AQI member; disambiguation happens
    // in the ranking list below the map (avoids a redundant drawer).
    function handleClusterClick(c: Cluster): void {
        const worst = c.members.reduce((a, b) => (a.aqi >= b.aqi ? a : b));
        onSelect(worst);
    }

    return (
        <div className="space-y-3">
            <svg
                viewBox={`${-0.4} ${-0.2} ${W + 0.8} ${H + 0.4}`}
                className="w-full h-auto select-none"
                role="img"
                aria-label="Austria hospital AQI map"
            >
                <defs>
                    <pattern id="dots" width="0.15" height="0.15" patternUnits="userSpaceOnUse">
                        <circle cx="0.02" cy="0.02" r="0.008" fill="currentColor" opacity="0.15"/>
                    </pattern>
                </defs>

                <path d={outlinePath} fill="url(#dots)" className="text-ink-400 dark:text-ink-500"/>
                <path
                    d={outlinePath}
                    fill="none"
                    className="stroke-ink-400 dark:stroke-ink-500"
                    strokeWidth={0.02}
                    strokeLinejoin="round"
                />

                {clusters.map((c) => {
                    const [cx, cy] = project(c.lat, c.lng);
                    const bucket = aqiBucket(c.aqi);
                    const r = 0.09 + Math.min(0.12, c.members.length * 0.02);
                    const selected =
                        selectedName !== undefined && c.members.some((m) => m.name === selectedName);
                    const {tx, ty, anchor} = labelPlacement(cx, cy);
                    const labelWidth = Math.max(1.3, c.label.length * 0.08);
                    return (
                        <g
                            key={c.label}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleClusterClick(c)}
                            className="cursor-pointer"
                        >
                            <line
                                x1={cx}
                                y1={cy}
                                x2={tx + (anchor === "end" ? 0.02 : -0.02)}
                                y2={ty - 0.04}
                                className="stroke-ink-400 dark:stroke-ink-600"
                                strokeWidth={0.006}
                            />
                            <circle
                                cx={cx}
                                cy={cy}
                                r={r + 0.04}
                                fill={BUCKET_FILL[bucket]}
                                className="transition-opacity"
                                opacity={selected ? 0.9 : 0.6}
                            />
                            <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="white"
                                stroke={BUCKET_STROKE[bucket]}
                                strokeWidth={selected ? 0.035 : 0.022}
                                className="dark:fill-ink-900"
                            />
                            {c.members.length > 1 && (
                                <text
                                    x={cx}
                                    y={cy + 0.035}
                                    fontSize={0.1}
                                    textAnchor="middle"
                                    className="fill-ink-800 dark:fill-ink-100 font-semibold pointer-events-none"
                                    style={{fontFamily: "var(--font-body)"}}
                                >
                                    {c.members.length}
                                </text>
                            )}
                            <rect
                                x={anchor === "end" ? tx - labelWidth - 0.02 : tx - 0.02}
                                y={ty - 0.10}
                                width={labelWidth + 0.04}
                                height={0.18}
                                rx={0.04}
                                className="fill-cream-50 dark:fill-ink-900"
                                opacity={0.92}
                            />
                            <text
                                x={tx}
                                y={ty}
                                fontSize={0.11}
                                textAnchor={anchor}
                                className="fill-ink-800 dark:fill-ink-100 pointer-events-none"
                                style={{fontFamily: "var(--font-body)", fontWeight: 500}}
                            >
                                {c.label}
                            </text>
                            <text
                                x={tx}
                                y={ty + 0.15}
                                fontSize={0.085}
                                textAnchor={anchor}
                                className="fill-ink-500 dark:fill-ink-400 pointer-events-none"
                                style={{fontFamily: "var(--font-body)"}}
                            >
                                AQI {c.aqi}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
