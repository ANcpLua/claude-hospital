export interface AqiReading {
  readonly zip: string;
  readonly city: string;
  readonly aqi: number;
  readonly dominant: string;
  readonly hours24: ReadonlyArray<number>;
}

const OWM_KEY_STORAGE = "meduni-openweather";

export function getOpenWeatherKey(): string {
  try {
    return localStorage.getItem(OWM_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setOpenWeatherKey(key: string): void {
  try {
    localStorage.setItem(OWM_KEY_STORAGE, key);
  } catch {
    /* quota / disabled storage */
  }
}

export function isAqiKeyAvailable(): boolean {
  return getOpenWeatherKey().trim().length > 0;
}

export const SEED_READINGS: ReadonlyArray<AqiReading> = [
  {
    zip: "1010",
    city: "Wien",
    aqi: 69,
    dominant: "NO₂ · traffic",
    hours24: [55, 58, 62, 66, 70, 74, 78, 80, 78, 74, 70, 68, 66, 64, 62, 60, 62, 66, 70, 74, 72, 70, 68, 66],
  },
  {
    zip: "4020",
    city: "Linz",
    aqi: 57,
    dominant: "PM2.5 · industrial",
    hours24: [48, 50, 53, 56, 60, 64, 68, 70, 66, 60, 55, 52, 50, 48, 46, 45, 46, 48, 52, 56, 58, 60, 58, 55],
  },
  {
    zip: "8010",
    city: "Graz",
    aqi: 54,
    dominant: "PM10 · basin inversion",
    hours24: [46, 48, 51, 54, 58, 62, 66, 68, 64, 58, 54, 51, 48, 45, 43, 42, 43, 46, 50, 54, 56, 58, 56, 53],
  },
];

interface GeocodeResponse {
  readonly zip?: string;
  readonly name?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly country?: string;
}

interface AirPollutionResponse {
  readonly list?: ReadonlyArray<{
    readonly main?: { readonly aqi?: number };
    readonly components?: Record<string, number>;
    readonly dt?: number;
  }>;
}

const POLLUTANT_LABELS: Record<string, string> = {
  pm2_5: "PM2.5",
  pm10: "PM10",
  o3: "O₃",
  no2: "NO₂",
  so2: "SO₂",
  co: "CO",
};

const POLLUTANT_THRESHOLDS: Record<string, number> = {
  pm2_5: 12,
  pm10: 54,
  o3: 70,
  no2: 53,
  so2: 35,
  co: 4400,
};

function dominantPollutant(comp: Record<string, number>): string {
  let best: { name: string; ratio: number } | null = null;
  for (const [k, v] of Object.entries(comp)) {
    const t = POLLUTANT_THRESHOLDS[k];
    if (!t) continue;
    const ratio = v / t;
    if (!best || ratio > best.ratio) best = { name: k, ratio };
  }
  return best ? (POLLUTANT_LABELS[best.name] ?? best.name) : "PM2.5";
}

const AQI_BREAKPOINTS = [0, 50, 100, 150, 200, 300] as const;

// PM2.5 ratio is used to interpolate inside the OWM 1–5 bucket so adjacent
// hours don't all collapse to the same round number.
function owmIndexToAqi(index: number, comp: Record<string, number>): number {
  const clamped = Math.min(5, Math.max(1, Math.round(index)));
  const lower = AQI_BREAKPOINTS[clamped - 1] ?? 0;
  const upper = AQI_BREAKPOINTS[clamped] ?? 50;
  const refMax =
    clamped === 1 ? 12 : clamped === 2 ? 35 : clamped === 3 ? 55 : clamped === 4 ? 150 : 250;
  const frac = Math.min(1, (comp.pm2_5 ?? 0) / refMax);
  return Math.round(lower + (upper - lower) * frac);
}

async function geocodeZip(
  zip: string,
  key: string,
): Promise<{ readonly lat: number; readonly lon: number; readonly city: string } | null> {
  try {
    const r = await fetch(
      `https://api.openweathermap.org/geo/1.0/zip?zip=${encodeURIComponent(zip)},AT&appid=${encodeURIComponent(key)}`,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as GeocodeResponse;
    if (typeof data.lat !== "number" || typeof data.lon !== "number") return null;
    return { lat: data.lat, lon: data.lon, city: data.name ?? zip };
  } catch {
    return null;
  }
}

export async function fetchAqi(zip: string): Promise<AqiReading | null> {
  const key = getOpenWeatherKey();
  if (!key) return null;
  const geo = await geocodeZip(zip, key);
  if (!geo) return null;
  try {
    const r = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${geo.lat}&lon=${geo.lon}&appid=${encodeURIComponent(key)}`,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as AirPollutionResponse;
    const series = (data.list ?? []).slice(0, 24);
    if (series.length === 0) return null;
    const aqis = series.map((p) =>
      p.main?.aqi !== undefined && p.components
        ? owmIndexToAqi(p.main.aqi, p.components)
        : 0,
    );
    const first = series[0]!;
    return {
      zip,
      city: geo.city,
      aqi: aqis[0] ?? 0,
      dominant: dominantPollutant(first.components ?? {}),
      hours24: aqis,
    };
  } catch {
    return null;
  }
}

export function aqiColor(aqi: number): string {
  if (aqi <= 50) return "text-emerald-600";
  if (aqi <= 100) return "text-amber-600";
  if (aqi <= 150) return "text-orange-600";
  return "text-rose-700";
}
