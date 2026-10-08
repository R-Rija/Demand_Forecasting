import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Activity,
  MessageCircle,
  X,
  Send,
  Zap,
  Cloud,
  Boxes,
  ShieldCheck,
  Truck,
  Loader2,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Gauge,
  LayoutGrid,
  ClipboardList,
  Sparkles,
  Sun,
  Moon,
  Leaf,
  ArrowRight,
  Check,
  Ban,
  Inbox,
  IndianRupee,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Themes (pastel lavender to green, light + dark)
// ---------------------------------------------------------------------------
const T_LIGHT = {
  bg: "#f7f5fb",
  surface: "#ffffff",
  surfaceAlt: "#f3f2fb",
  border: "#e3e1f0",
  text: "#2b2a4c",
  sub: "#66668a",
  primary: "#8f95d6",
  primaryText: "#4a4fa0",
  primaryStrong: "#5a5fb5",
  primarySoft: "rgba(179, 183, 226, 0.3)",
  accentCyan: "#3f939c",
  high: "#b8507a",
  highSoft: "rgba(184, 80, 122, 0.09)",
  low: "#7f8a1f",
  lowSoft: "rgba(206, 226, 179, 0.5)",
  ok: "#3d8f6d",
  okSoft: "rgba(179, 226, 191, 0.42)",
  violet: "#8563b3",
  violetSoft: "rgba(214, 179, 226, 0.32)",
  sidebar: "linear-gradient(180deg, #d6b3e2 0%, #b3b7e2 55%, #b3dee2 100%)",
  sideText: "#2b2a4c",
  sideSub: "rgba(43, 42, 76, 0.66)",
  sideActiveBg: "rgba(255, 255, 255, 0.55)",
  sideMarker: "#5a5fb5",
  sideCardBg: "rgba(255, 255, 255, 0.42)",
  sideCardBorder: "rgba(255, 255, 255, 0.7)",
  sideLogoBg: "#2b2a4c",
  sideLogoText: "#ffffff",
  hero: "linear-gradient(120deg, #d6b3e2 0%, #b3b7e2 35%, #b3dee2 70%, #b3e2bf 100%)",
  heroText: "#2b2a4c",
  heroSub: "rgba(43, 42, 76, 0.72)",
  heroPanel: "rgba(255, 255, 255, 0.5)",
  heroPanelBorder: "rgba(255, 255, 255, 0.75)",
  heroTrack: "rgba(43, 42, 76, 0.1)",
  heroOk: "#3d9a74",
  heroLow: "#96a52f",
  heroHigh: "#c0507a",
  heroBtnBg: "#2b2a4c",
  heroBtnText: "#ffffff",
  shadow: "0 1px 2px rgba(43, 42, 76, 0.05), 0 8px 24px -14px rgba(90, 95, 181, 0.3)",
};

const T_DARK = {
  bg: "#16162b",
  surface: "#1e1e3a",
  surfaceAlt: "#25254a",
  border: "#34345e",
  text: "#eeeefb",
  sub: "#a9a9d0",
  primary: "#b3b7e2",
  primaryText: "#b3b7e2",
  primaryStrong: "#6b70c8",
  primarySoft: "rgba(179, 183, 226, 0.14)",
  accentCyan: "#b3dee2",
  high: "#e2a0bd",
  highSoft: "rgba(226, 160, 189, 0.13)",
  low: "#cee2b3",
  lowSoft: "rgba(206, 226, 179, 0.12)",
  ok: "#b3e2bf",
  okSoft: "rgba(179, 226, 191, 0.12)",
  violet: "#d6b3e2",
  violetSoft: "rgba(214, 179, 226, 0.14)",
  sidebar: "#10102a",
  sideText: "#f4f3ff",
  sideSub: "rgba(244, 243, 255, 0.66)",
  sideActiveBg: "rgba(179, 183, 226, 0.16)",
  sideMarker: "#b3b7e2",
  sideCardBg: "rgba(255, 255, 255, 0.06)",
  sideCardBorder: "rgba(255, 255, 255, 0.12)",
  sideLogoBg: "#b3b7e2",
  sideLogoText: "#16162b",
  hero: "linear-gradient(120deg, #4b3a68 0%, #3f4677 40%, #2f5d70 75%, #2d6a5d 100%)",
  heroText: "#f4f3ff",
  heroSub: "rgba(244, 243, 255, 0.75)",
  heroPanel: "rgba(255, 255, 255, 0.08)",
  heroPanelBorder: "rgba(255, 255, 255, 0.16)",
  heroTrack: "rgba(255, 255, 255, 0.14)",
  heroOk: "#b3e2bf",
  heroLow: "#cee2b3",
  heroHigh: "#e2b3cb",
  heroBtnBg: "#f4f3ff",
  heroBtnText: "#2b2a4c",
  shadow: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -14px rgba(0, 0, 0, 0.55)",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Risk = "high" | "low" | "ok";
type Trend = "up" | "down" | "flat";
type AgentStatus = "idle" | "running" | "success";
type RecStatus = "pending" | "approved" | "rejected";
type TabId = "overview" | "demand" | "stock" | "recommendations" | "guardrails";

interface StockRow {
  sku: string;
  product: string;
  category: string;
  subcategory: string;
  region: string;
  warehouse: string;
  avail: number;
  target: number;
  risk: Risk;
  trend: Trend;
  trendPct: number;
  reasoning: string;
}

interface DemandRow {
  sku: string;
  store: string;
  forecast: number;
  actual: number;
}

interface Recommendation {
  id: string;
  sku: string;
  region: string;
  expectedDemand: number;
  newForecast: number;
  increasePct: number;
  drivers: string[];
  action: string;
  stockoutReductionPct: number;
  incrementalSalesInr: string;
  transportCostInr: string;
  confidencePct: number;
  status: RecStatus;
  warehouse?: string;
  store?: string;
  sourceStock?: number;
  destStock?: number;
  reason?: string;
  validationNotes?: string;
  product?: string;
}

interface ExecMetric {
  label: string;
  value: string;
  icon: string;
  isHigh?: boolean;
  isLow?: boolean;
  isOk?: boolean;
  isCyan?: boolean;
}

interface BeforeAfterRow {
  metric: string;
  before: string;
  after: string;
}

interface AutomationRule {
  action: string;
  threshold: string;
  level: "Automatic" | "Human";
}

interface Guardrail {
  name: string;
  rule: string;
}

// ---------------------------------------------------------------------------
// Static data & Config
// ---------------------------------------------------------------------------
const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3001/api");

const AGENTS = [
  { id: "forecast", name: "Demand forecasting", desc: "Reads sales signals and projects demand", icon: Cloud, accentType: "primary" },
  { id: "allocation", name: "Allocation optimizer", desc: "Balances stock across warehouses", icon: Boxes, accentType: "accentCyan" },
  { id: "validation", name: "Validation and guardrails", desc: "Checks every action against the rules", icon: ShieldCheck, accentType: "violet" },
  { id: "execution", name: "Execution", desc: "Raises transfers and purchase orders", icon: Truck, accentType: "ok" },
];

const ICONS: Record<string, React.ElementType> = {
  Target, AlertTriangle, Boxes, IndianRupee, Zap,
};

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "demand", label: "Demand monitoring", icon: Activity },
  { id: "stock", label: "Stock and regions", icon: Boxes },
  { id: "recommendations", label: "Recommendations", icon: Sparkles },
  { id: "guardrails", label: "Guardrails and automation", icon: ShieldCheck },
];

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap');
.crcc-root, .crcc-root * { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; }
.crcc-root .crcc-serif { font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; letter-spacing: -0.01em; }
.crcc-root { font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
.crcc-root button:focus-visible, .crcc-root select:focus-visible, .crcc-root input:focus-visible { outline: 2px solid #5a5fb5; outline-offset: 2px; }
.crcc-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
.crcc-scroll::-webkit-scrollbar-thumb { background: rgba(88, 114, 102, 0.35); border-radius: 8px; }
@keyframes crcc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.crcc-fade { animation: crcc-fade .35s ease both; }
@media (prefers-reduced-motion: reduce) { .crcc-fade { animation: none; } }
`;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function Card({
  children,
  theme: T,
  className = "",
  accent,
}: {
  children: React.ReactNode;
  theme: any;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-2xl border overflow-hidden ${className}`}
      style={{
        borderColor: T.border,
        backgroundColor: T.surface,
        boxShadow: T.shadow,
        borderTop: accent ? `2px solid ${accent}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  theme: T,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  theme: any;
}) {
  return (
    <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b" style={{ borderColor: T.border }}>
      <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: T.primarySoft, color: T.primaryText }}>
        <Icon size={17} />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold leading-tight" style={{ color: T.text }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: T.sub }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function Pill({ label, color, bg, dot = true }: { label: string; color: string; bg: string; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ color, backgroundColor: bg }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
  );
}

function riskBadge(risk: Risk, T: any) {
  const map = {
    high: { label: "High risk", color: T.high, bg: T.highSoft },
    low: { label: "Overstock", color: T.low, bg: T.lowSoft },
    ok: { label: "On target", color: T.ok, bg: T.okSoft },
  } as const;
  const c = map[risk] || map.ok;
  return <Pill label={c.label} color={c.color} bg={c.bg} />;
}

function deviationBadge(pct: number, T: any) {
  if (isNaN(pct) || !isFinite(pct)) pct = 0;
  const bad = Math.abs(pct) >= 20;
  const color = pct >= 0 ? (bad ? T.high : T.ok) : bad ? T.low : T.ok;
  const bg = pct >= 0 ? (bad ? T.highSoft : T.okSoft) : bad ? T.lowSoft : T.okSoft;
  return <Pill label={`${pct > 0 ? "+" : ""}${pct}%`} color={color} bg={bg} />;
}

function TrendIcon({ trend, theme: T }: { trend: Trend; theme: any }) {
  if (trend === "up") return <TrendingUp size={15} style={{ color: T.high }} />;
  if (trend === "down") return <TrendingDown size={15} style={{ color: T.low }} />;
  return <Minus size={15} style={{ color: T.sub }} />;
}

function EmptyState({ theme: T, title, hint }: { theme: any; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: T.primarySoft, color: T.primaryText }}>
        <Inbox size={22} />
      </div>
      <div className="text-sm font-semibold" style={{ color: T.text }}>{title}</div>
      <div className="text-xs mt-1 max-w-xs" style={{ color: T.sub }}>{hint}</div>
    </div>
  );
}

function parseNum(s: string): number | null {
  const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewTab({
  theme: T,
  metrics,
  impact,
}: {
  theme: any;
  metrics: ExecMetric[];
  impact: BeforeAfterRow[];
}) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {metrics.map((m) => {
          const color = m.isHigh ? T.high : m.isLow ? T.low : m.isOk ? T.ok : m.isCyan ? T.accentCyan : T.primary;
          const Icon = ICONS[m.icon] || Target;
          return (
            <Card key={m.label} theme={T} accent={color}>
              <div className="p-5 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium leading-snug" style={{ color: T.sub }}>{m.label}</span>
                  <div
                    className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}1f`, color }}
                  >
                    <Icon size={17} />
                  </div>
                </div>
                <div
                  className="crcc-serif text-2xl font-semibold mt-3 leading-none truncate"
                  style={{ color: T.text }}
                  title={m.value}
                >
                  {m.value}
                </div>
              </div>
            </Card>
          );
        })}
        {metrics.length === 0 && (
          <div className="col-span-full">
            <Card theme={T}>
              <EmptyState theme={T} title="No KPI data yet" hint="Start the backend on port 3001 to load live metrics from Supabase Postgres." />
            </Card>
          </div>
        )}
      </div>

      {/* Impact table */}
      <Card theme={T}>
        <SectionHeader icon={Gauge} title="Before and after impact" subtitle="Change in each metric once the agents are running" theme={T} />
        <div className="overflow-x-auto crcc-scroll">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr style={{ backgroundColor: T.surfaceAlt, color: T.sub }}>
                <th className="text-left font-medium px-6 py-3">Metric</th>
                <th className="text-left font-medium px-6 py-3">Before AI</th>
                <th className="text-left font-medium px-6 py-3">After AI</th>
                <th className="text-left font-medium px-6 py-3">Change</th>
              </tr>
            </thead>
            <tbody>
              {impact.map((row) => {
                const b = parseNum(row.before);
                const a = parseNum(row.after);
                const delta = b !== null && a !== null && b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 100) : null;
                return (
                  <tr key={row.metric} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-6 py-4 font-medium" style={{ color: T.text }}>{row.metric}</td>
                    <td className="px-6 py-4 font-semibold" style={{ color: T.high }}>{row.before}</td>
                    <td className="px-6 py-4 font-semibold" style={{ color: T.ok }}>{row.after}</td>
                    <td className="px-6 py-4">
                      {delta === null ? (
                        <span style={{ color: T.sub }}>Not comparable</span>
                      ) : (
                        <Pill label={`${delta > 0 ? "+" : ""}${delta}%`} color={T.primaryText} bg={T.primarySoft} dot={false} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {impact.length === 0 && <EmptyState theme={T} title="No impact data yet" hint="Impact figures appear after the first pipeline run." />}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demand monitoring
// ---------------------------------------------------------------------------
function DemandMonitoringTab({ theme: T, data }: { theme: any; data: DemandRow[] }) {
  const maxVal = Math.max(1, ...data.map((r) => Math.max(r.forecast, r.actual)));
  return (
    <Card theme={T}>
      <SectionHeader icon={Activity} title="Forecast vs actual demand" subtitle="Deviation of 20% or more is flagged" theme={T} />
      <div className="overflow-x-auto crcc-scroll">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium" style={{ color: T.sub, backgroundColor: T.surfaceAlt }}>
            <div className="col-span-2">SKU</div>
            <div className="col-span-2">Store</div>
            <div className="col-span-1 text-right">Forecast</div>
            <div className="col-span-1 text-right">Actual</div>
            <div className="col-span-4">Forecast and actual</div>
            <div className="col-span-2 text-right">Deviation</div>
          </div>
          {data.map((r, i) => {
            const dev = r.forecast > 0 ? Math.round(((r.actual - r.forecast) / r.forecast) * 100) : 0;
            return (
              <div
                key={`${r.sku}-${r.store}-${i}`}
                className="grid grid-cols-12 gap-4 px-6 py-3.5 text-sm items-center"
                style={{ borderTop: `1px solid ${T.border}` }}
              >
                <div className="col-span-2 font-semibold truncate" style={{ color: T.text }}>{r.sku}</div>
                <div className="col-span-2 truncate" style={{ color: T.sub }}>{r.store}</div>
                <div className="col-span-1 text-right font-medium">{r.forecast}</div>
                <div className="col-span-1 text-right font-medium">{r.actual}</div>
                <div className="col-span-4 space-y-1">
                  <div className="h-1.5 rounded-full" style={{ backgroundColor: T.border }}>
                    <div className="h-full rounded-full" style={{ width: `${(r.forecast / maxVal) * 100}%`, backgroundColor: T.accentCyan }} />
                  </div>
                  <div className="h-1.5 rounded-full" style={{ backgroundColor: T.border }}>
                    <div className="h-full rounded-full" style={{ width: `${(r.actual / maxVal) * 100}%`, backgroundColor: T.primary }} />
                  </div>
                </div>
                <div className="col-span-2 flex justify-end">{deviationBadge(dev, T)}</div>
              </div>
            );
          })}
        </div>
      </div>
      {data.length === 0 && <EmptyState theme={T} title="No demand data" hint="Live forecast and actuals appear here once the backend responds." />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stock & regions
// ---------------------------------------------------------------------------
function StockRegionsTab({ theme: T, data }: { theme: any; data: StockRow[] }) {
  const [region, setRegion] = useState("All regions");
  const [riskFilter, setRiskFilter] = useState<"all" | Risk>("all");

  const regionsList = ["All regions", ...Array.from(new Set(data.map((r) => r.region)))];

  const filtered = useMemo(
    () =>
      data
        .filter((r) => (region === "All regions" ? true : r.region === region))
        .filter((r) => (riskFilter === "all" ? true : r.risk === riskFilter)),
    [region, riskFilter, data]
  );

  const barColor = (r: Risk) => (r === "high" ? T.high : r === "low" ? T.low : T.ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-xl px-3.5 py-2.5 text-sm font-medium cursor-pointer"
          style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, color: T.text, boxShadow: T.shadow }}
        >
          {regionsList.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <div className="flex rounded-xl overflow-hidden border p-1 gap-1" style={{ borderColor: T.border, backgroundColor: T.surface, boxShadow: T.shadow }}>
          {(["all", "high", "low", "ok"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setRiskFilter(f)}
              className="px-3.5 py-1.5 text-[13px] font-semibold border-none cursor-pointer rounded-lg"
              style={{
                backgroundColor: riskFilter === f ? T.primaryStrong : "transparent",
                color: riskFilter === f ? "#fff" : T.sub,
              }}
            >
              {f === "all" ? "All" : f === "high" ? "High risk" : f === "low" ? "Overstock" : "On target"}
            </button>
          ))}
        </div>
        <span className="text-xs ml-auto" style={{ color: T.sub }}>
          {filtered.length} of {data.length} rows
        </span>
      </div>

      <Card theme={T}>
        <div className="overflow-x-auto crcc-scroll">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium" style={{ color: T.sub, backgroundColor: T.surfaceAlt }}>
              <div className="col-span-3">Product</div>
              <div className="col-span-2">City / Store</div>
              <div className="col-span-2">Stock vs Safety Target</div>
              <div className="col-span-1" title="Demand forecast deviation: how much the AI expects demand to change vs baseline. Does NOT reflect stock level change.">Demand Forecast ↑↓</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-3">Forecast reasoning</div>
            </div>
            {filtered.map((r, i) => {
              const pct = r.target > 0 ? Math.min(100, Math.round((r.avail / r.target) * 100)) : 0;
              return (
                <div
                  key={`${r.sku}-${r.region}-${i}`}
                  className="grid grid-cols-12 gap-4 px-6 py-4 text-sm items-start"
                  style={{ borderTop: `1px solid ${T.border}` }}
                >
                  <div className="col-span-3 min-w-0">
                    <div className="font-semibold" style={{ color: T.text }}>{r.product}</div>
                    <div className="text-xs mt-0.5" style={{ color: T.sub }}>
                      {r.sku}, {r.category} / {r.subcategory}
                    </div>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <div className="font-medium">{r.region}</div>
                    <div className="text-xs mt-0.5" style={{ color: T.sub }}>{r.warehouse}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-semibold">{r.avail}</span>
                      <span className="text-xs" style={{ color: T.sub }}>of {r.target} target</span>
                    </div>
                    <div className="h-1.5 rounded-full mt-2" style={{ backgroundColor: T.border }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor(r.risk) }} />
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center gap-1.5" title={r.trendPct > 0 ? `Demand forecast is ${r.trendPct}% HIGHER than baseline` : r.trendPct < 0 ? `Demand forecast is ${Math.abs(r.trendPct)}% LOWER than baseline` : 'Demand is tracking baseline forecast'}>
                    <TrendIcon trend={r.trend} theme={T} />
                    <span className="text-xs font-medium">{r.trendPct > 0 ? '+' : ''}{r.trendPct}%</span>
                  </div>
                  <div className="col-span-1">{riskBadge(r.risk, T)}</div>
                  <div className="col-span-3 text-xs leading-relaxed" style={{ color: T.sub }}>{r.reasoning}</div>
                </div>
              );
            })}
          </div>
        </div>
        {filtered.length === 0 && (
          <EmptyState theme={T} title="No rows match" hint="Change the region or status filter, or check that the backend is running." />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
function RecommendationsTab({
  theme: T,
}: {
  theme: any;
}) {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [data, setData] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);

  const fetchByStatus = async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/recommendations?status=${status}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    setSelectedRec(null);
    fetchByStatus(filter); 
  }, [filter]);

  return (
    <div className="space-y-5">
      {!selectedRec && (
        <div className="flex gap-2 pb-2">
          {(["pending", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold capitalize border cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === f ? T.primaryStrong : "transparent",
                color: filter === f ? "#fff" : T.sub,
                borderColor: filter === f ? T.primaryStrong : T.border,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 justify-center" style={{ color: T.sub }}>
          <Loader2 size={16} className="animate-spin" /> Loading {filter} recommendations from Supabase Postgres...
        </div>
      )}

      {!loading && !selectedRec && data.length === 0 && (
        <Card theme={T}>
          <EmptyState theme={T} title={`No ${filter} recommendations`} hint={`There are currently no items in the ${filter} queue.`} />
        </Card>
      )}

      {!loading && !selectedRec && data.length > 0 && (
        <Card theme={T}>
          <div className="overflow-x-auto crcc-scroll">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr style={{ backgroundColor: T.surfaceAlt, color: T.sub }}>
                  <th className="text-left font-medium px-6 py-3">ID / SKU</th>
                  <th className="text-left font-medium px-6 py-3">Product</th>
                  <th className="text-left font-medium px-6 py-3">Action</th>
                  <th className="text-left font-medium px-6 py-3">Confidence</th>
                  <th className="text-center font-medium px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.map((rec) => (
                  <tr key={rec.id} className="border-b transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ borderColor: T.border, color: T.text }}>
                    <td className="px-6 py-4">
                      <div className="font-semibold">{rec.id.replace('alloc-', '#')}</div>
                      <div className="text-xs mt-1" style={{ color: T.sub }}>{rec.sku}</div>
                    </td>
                    <td className="px-6 py-4">{rec.product}</td>
                    <td className="px-6 py-4">{rec.action}</td>
                    <td className="px-6 py-4 text-emerald-500 font-bold">{rec.confidencePct}%</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedRec(rec)}
                        className="px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer border"
                        style={{ backgroundColor: T.surface, color: T.text, borderColor: T.border }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && selectedRec && (() => {
        const rec = selectedRec;
        const status = rec.status || "pending";
        const stats = [
          { label: "Expected demand", value: rec.expectedDemand, color: T.text },
          { label: "New forecast", value: rec.newForecast, color: T.primaryText },
          { label: "Increase", value: `+${rec.increasePct}%`, color: T.high },
          { label: "Confidence", value: `${rec.confidencePct}%`, color: T.ok },
        ];
        return (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedRec(null)}
              className="flex items-center gap-2 text-sm font-semibold cursor-pointer mb-2"
              style={{ color: T.sub }}
            >
              ← Back to {filter} list
            </button>
            <Card theme={T} accent={status === "approved" ? T.ok : status === "rejected" ? T.high : T.low}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: T.highSoft, color: T.high }}>
                      <AlertTriangle size={19} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold flex items-center gap-2" style={{ color: T.text }}>
                        Demand anomaly detected
                        {status === "pending" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wider">
                            Level 3 Escalation
                          </span>
                        )}
                      </div>
                      <div className="text-sm mt-0.5" style={{ color: T.sub }}>{rec.sku} - {rec.product} in {rec.region}</div>
                    </div>
                  </div>
                  {status === "pending" && <Pill label="Awaiting decision" color={T.low} bg={T.lowSoft} />}
                  {status === "approved" && <Pill label="Approved" color={T.ok} bg={T.okSoft} />}
                  {status === "rejected" && <Pill label="Rejected" color={T.high} bg={T.highSoft} />}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-xl px-4 py-3 border" style={{ borderColor: T.border, backgroundColor: T.surfaceAlt }}>
                      <div className="text-xs" style={{ color: T.sub }}>{s.label}</div>
                      <div className="crcc-serif text-2xl font-semibold mt-1" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mb-5">
                  <div className="text-xs font-medium mb-2" style={{ color: T.sub }}>Drivers</div>
                  <div className="flex flex-wrap gap-2">
                    {rec.drivers.map((d, i) => (
                      <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: T.violetSoft, color: T.violet }}>
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-5 relative">
                  <div className="flex-1 rounded-xl px-5 py-4" style={{ backgroundColor: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                     <div className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: T.sub }}>Source</div>
                     <div className="text-sm font-medium mb-3 truncate" style={{ color: T.text }} title={rec.warehouse}>{rec.warehouse}</div>
                     <div className="flex justify-between items-center">
                       <div>
                         <div className="text-[11px]" style={{ color: T.sub }}>Current Stock</div>
                         <div className="text-lg font-bold" style={{ color: T.text }}>{rec.sourceStock} <span className="text-xs font-normal" style={{color: T.sub}}>units</span></div>
                       </div>
                     </div>
                  </div>
                  
                  <div className="hidden md:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                     <div className="h-8 w-8 rounded-full flex items-center justify-center shadow-sm" style={{ backgroundColor: '#fff', border: `1px solid ${T.border}`, color: T.sub }}>
                       <ArrowRight size={14} />
                     </div>
                  </div>

                  <div className="flex-1 rounded-xl px-5 py-4" style={{ backgroundColor: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                     <div className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: T.sub }}>Destination</div>
                     <div className="text-sm font-medium mb-3 truncate" style={{ color: T.text }} title={rec.store}>{rec.store}</div>
                     <div className="flex justify-between items-center">
                       <div>
                         <div className="text-[11px]" style={{ color: T.sub }}>Current Stock</div>
                         <div className="text-lg font-bold" style={{ color: T.high }}>{rec.destStock} <span className="text-xs font-normal" style={{color: T.sub}}>units</span></div>
                       </div>
                       <div className="text-right border-l pl-4" style={{ borderColor: T.border }}>
                         <div className="text-[11px]" style={{ color: T.sub }}>Expected Demand</div>
                         <div className="text-lg font-bold" style={{ color: T.primaryText }}>{rec.expectedDemand} <span className="text-xs font-normal" style={{color: T.sub}}>units</span></div>
                       </div>
                     </div>
                  </div>
                </div>

                <div className="rounded-xl px-5 py-4 mb-5" style={{ backgroundColor: T.primarySoft, border: `1px solid ${T.border}` }}>
                  <div className="text-xs font-medium mb-1" style={{ color: T.sub }}>Recommended action</div>
                  <div className="text-sm font-medium" style={{ color: T.text }}>{rec.action}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t" style={{ borderColor: T.border }}>
                    <div>
                      <div className="text-xs" style={{ color: T.sub }}>Stockout reduction</div>
                      <div className="text-sm font-bold mt-0.5" style={{ color: T.ok }}>{rec.stockoutReductionPct}%</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: T.sub }}>Incremental sales</div>
                      <div className="text-sm font-bold mt-0.5" style={{ color: T.ok }}>{rec.incrementalSalesInr}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: T.sub }}>Transport cost</div>
                      <div className="text-sm font-bold mt-0.5" style={{ color: T.text }}>{rec.transportCostInr}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl px-5 py-4 mb-5" style={{ backgroundColor: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                  <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: T.sub }}>AI Reasoning & Validation</div>
                  <p className="text-sm" style={{ color: T.text, lineHeight: '1.5' }}>
                    {rec.validationNotes || rec.reason || "No specific reasoning provided."}
                  </p>
                </div>

                {status === "pending" && (
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`${API}/recommendations/${rec.id}/status`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'approved' })
                          });
                          setSelectedRec(null);
                          fetchByStatus(filter);
                        } catch(e) { console.error(e) }
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
                      style={{ backgroundColor: T.primaryStrong, color: "#fff" }}
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`${API}/recommendations/${rec.id}/status`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'rejected' })
                          });
                          setSelectedRec(null);
                          fetchByStatus(filter);
                        } catch(e) { console.error(e) }
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                      style={{ backgroundColor: "transparent", color: T.high, border: `1px solid ${T.high}` }}
                    >
                      <Ban size={16} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------
function GuardrailsTab({ theme: T, rules }: { theme: any; rules: { automation?: AutomationRule[]; guardrails?: Guardrail[] } }) {
  const automation = rules.automation || [];
  const guardrails = rules.guardrails || [];
  const [history, setHistory] = useState<any[]>([]);
  const [selectedRow, setSelectedRow] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/history`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setHistory(d);
      })
      .catch(console.error);
  }, []);

  const [showRules, setShowRules] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-start">
        <button
          onClick={() => setShowRules(!showRules)}
          className="px-5 py-2.5 text-sm font-semibold border cursor-pointer rounded-xl transition-all flex items-center gap-2"
          style={{
            backgroundColor: showRules ? T.primaryStrong : T.surface,
            color: showRules ? "#fff" : T.text,
            borderColor: showRules ? T.primaryStrong : T.border,
            boxShadow: T.shadow
          }}
        >
          <ShieldCheck size={16} />
          {showRules ? "Hide Agent Guardrails & Automation Rules" : "View Agent Guardrails & Automation Rules"}
        </button>
      </div>

      <Card theme={T}>
        <SectionHeader icon={Activity} title="Execution History" subtitle="Recent actions automatically approved or rejected by the Validation Agent" theme={T} />
        <div className="overflow-x-auto crcc-scroll">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ backgroundColor: T.surfaceAlt, color: T.sub }}>
                <th className="text-left font-medium px-6 py-3">ID / SKU</th>
                <th className="text-left font-medium px-6 py-3">Qty</th>
                <th className="text-left font-medium px-6 py-3">From</th>
                <th className="text-left font-medium px-6 py-3">To</th>
                <th className="text-left font-medium px-6 py-3">Decision</th>
                <th className="text-left font-medium px-6 py-3">Reasoning</th>
              </tr>
            </thead>
            <tbody>
                {history.map((h, i) => {
                  const isApproved = h.status.includes('approved') || h.status.includes('executed');
                  const isRejected = h.status.includes('rejected');
                  const isSelected = selectedRow?.id === h.id;
                  return (
                    <React.Fragment key={i}>
                      <tr 
                        style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer', backgroundColor: isSelected ? T.surfaceAlt : 'transparent' }}
                        onClick={() => setSelectedRow(isSelected ? null : h)}
                        className="hover:opacity-80 transition-opacity"
                      >
                    <td className="px-6 py-4">
                      <div className="font-medium" style={{ color: T.text }}>{h.sku}</div>
                      <div className="text-xs mt-1" style={{ color: T.sub }}>ID: {h.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: T.primarySoft, color: T.primaryStrong }}>
                        {h.qty} units
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs" style={{ color: T.sub }}>{h.fromWarehouse || 'N/A'}</td>
                    <td className="px-6 py-4 text-xs" style={{ color: T.sub }}>{h.toStore || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <Pill 
                        label={h.status.toUpperCase()} 
                        color={isApproved ? T.ok : isRejected ? T.high : T.warn} 
                        bg={isApproved ? T.okSoft : isRejected ? T.highSoft : T.warnSoft} 
                      />
                    </td>
                    <td className="px-6 py-4 text-xs" style={{ color: T.sub, maxWidth: '260px' }}>
                      {h.reason}
                    </td>
                  </tr>
                  {isSelected && (
                    <tr>
                      <td colSpan={6} className="p-0 border-0">
                        <div className="p-6 m-4 mt-0 rounded-2xl shadow-sm border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold" style={{ color: T.text }}>Decision Reasoning for {h.sku}</h3>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedRow(null); }} className="bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity" style={{ color: T.sub }}>
                              <X size={20} />
                            </button>
                          </div>
                          <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="p-3 rounded-xl" style={{ backgroundColor: T.surfaceAlt }}>
                                <div className="text-xs mb-1" style={{ color: T.sub }}>Qty Transferred</div>
                                <div className="text-lg font-bold" style={{ color: T.primaryStrong }}>{h.qty}</div>
                              </div>
                              <div className="p-3 rounded-xl" style={{ backgroundColor: T.surfaceAlt }}>
                                <div className="text-xs mb-1" style={{ color: T.sub }}>Est. Value</div>
                                <div className="text-sm font-bold" style={{ color: T.text }}>₹{Number(h.estimatedValue || 0).toLocaleString('en-IN')}</div>
                              </div>
                              <div className="p-3 rounded-xl" style={{ backgroundColor: T.surfaceAlt }}>
                                <div className="text-xs mb-1" style={{ color: T.sub }}>Decision Type</div>
                                <div className="text-sm font-bold" style={{ color: T.text }}>{h.approvalType || 'Auto'}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div className="p-3 rounded-xl" style={{ backgroundColor: T.surfaceAlt }}>
                                <div className="text-xs mb-1" style={{ color: T.sub }}>From (Source)</div>
                                <div className="text-sm font-medium mb-2" style={{ color: T.text }}>{h.fromWarehouse || 'N/A'}</div>
                                <div className="text-xs flex justify-between items-center pt-2 border-t" style={{ color: T.text, borderColor: T.border }}>
                                  <span style={{ color: T.sub }}>Available Stock</span>
                                  <span className="font-bold">{h.sourceStock || 0} units</span>
                                </div>
                              </div>
                              <div className="p-3 rounded-xl" style={{ backgroundColor: T.surfaceAlt }}>
                                <div className="text-xs mb-1" style={{ color: T.sub }}>To (Destination)</div>
                                <div className="text-sm font-medium mb-2" style={{ color: T.text }}>{h.toStore || 'N/A'}</div>
                                <div className="text-xs flex justify-between items-center pt-2 border-t" style={{ color: T.text, borderColor: T.border }}>
                                  <span style={{ color: T.sub }}>Current Stock</span>
                                  <span className="font-bold">{h.destStock || 0} units</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs mb-1" style={{ color: T.sub }}>Detailed Reasoning</div>
                              <div className="text-sm p-4 rounded-xl leading-relaxed mt-2" style={{ backgroundColor: T.surfaceAlt, color: T.text, border: `1px solid ${T.border}` }}>
                                {h.reason || "Processed by Validation Agent"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {history.length === 0 && <EmptyState theme={T} title="No execution history" hint="History loads from the backend." />}
      </Card>

      {showRules && (
        <>
          <Card theme={T}>
            <SectionHeader icon={ClipboardList} title="Human-in-the-loop automation" subtitle="Which actions run automatically and which need approval" theme={T} />
            <div className="overflow-x-auto crcc-scroll">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr style={{ backgroundColor: T.surfaceAlt, color: T.sub }}>
                    <th className="text-left font-medium px-6 py-3">Action</th>
                    <th className="text-left font-medium px-6 py-3">Threshold</th>
                    <th className="text-left font-medium px-6 py-3">Automation level</th>
                  </tr>
                </thead>
                <tbody>
                  {automation.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td className="px-6 py-4 font-medium" style={{ color: T.text }}>{r.action}</td>
                      <td className="px-6 py-4" style={{ color: T.sub }}>{r.threshold}</td>
                      <td className="px-6 py-4">
                        {r.level === "Automatic" ? (
                          <Pill label="Automatic" color={T.ok} bg={T.okSoft} />
                        ) : (
                          <Pill label="Needs approval" color={T.high} bg={T.highSoft} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {automation.length === 0 && <EmptyState theme={T} title="No automation rules" hint="Rules load from the backend once it is running." />}
          </Card>

          <Card theme={T}>
            <SectionHeader icon={ShieldCheck} title="Active guardrails" subtitle="Checks the validation agent applies to every action" theme={T} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
              {guardrails.map((g, i) => (
                <div key={i} className="flex gap-3 p-4 rounded-xl border" style={{ backgroundColor: T.surfaceAlt, borderColor: T.border }}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: T.primarySoft, color: T.primaryText }}>
                    <ShieldCheck size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: T.text }}>{g.name}</div>
                    <div className="text-[13px] mt-0.5 leading-relaxed" style={{ color: T.sub }}>{g.rule}</div>
                  </div>
                </div>
              ))}
            </div>
            {guardrails.length === 0 && <EmptyState theme={T} title="No guardrails loaded" hint="Guardrails load from the backend once it is running." />}
          </Card>
        </>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline drawer
// ---------------------------------------------------------------------------
function PipelineDrawer({
  open,
  onClose,
  statuses,
  theme: T,
}: {
  open: boolean;
  onClose: () => void;
  statuses: Record<string, AgentStatus>;
  theme: any;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(20, 15, 50, 0.5)" }} onClick={onClose} />
      <div className="relative w-full max-w-[420px] h-full border-l p-6 overflow-y-auto crcc-fade" style={{ backgroundColor: T.surface, borderColor: T.border }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold" style={{ color: T.text }}>Agent pipeline</h3>
          <button onClick={onClose} aria-label="Close" className="border-none bg-transparent cursor-pointer" style={{ color: T.sub }}>
            <X size={20} />
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: T.sub }}>Agents run in order. Each one passes its result to the next.</p>
        <div className="relative">
          <div className="absolute left-[26px] top-6 bottom-6 w-px" style={{ backgroundColor: T.border }} />
          <div className="space-y-4 relative">
            {AGENTS.map((agent) => {
              const Icon = agent.icon;
              const status = statuses[agent.id];
              const color = (T as any)[agent.accentType] || T.primary;
              return (
                <div key={agent.id} className="flex items-center gap-4 rounded-2xl border p-3.5" style={{ borderColor: T.border, backgroundColor: T.surfaceAlt }}>
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1f`, color }}>
                    <Icon size={19} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: T.text }}>{agent.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: T.sub }}>{agent.desc}</div>
                  </div>
                  <div className="shrink-0">
                    {status === "running" && <Loader2 size={18} className="animate-spin" style={{ color: T.primaryText }} />}
                    {status === "success" && <CheckCircle2 size={18} style={{ color: T.ok }} />}
                    {status === "idle" && <span className="text-xs" style={{ color: T.sub }}>Idle</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global chatbot
// ---------------------------------------------------------------------------
interface ChatMessage {
  id: number;
  role: "user" | "system";
  text: string;
}

function GlobalChatbot({ onTriggerPipeline, theme: T }: { onTriggerPipeline: () => void; theme: any }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, role: "system", text: "Ask about any metric on any tab, or say \"run the pipeline\"." },
  ]);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, busy]);

  const push = (role: "user" | "system", text: string) => {
    idRef.current += 1;
    setMessages((p) => [...p, { id: idRef.current, role, text }]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    push("user", text);
    setInput("");

    if (/\b(run|execute|trigger|start)\b.*\bpipeline\b/i.test(text)) {
      push("system", "Opening the agent pipeline and starting it now.");
      onTriggerPipeline();
      return;
    }

    setBusy(true);
    try {
      const chatHistory = messages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      }));
      // Append the new message
      chatHistory.push({ role: "user", content: text });

      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userMsg: text,
          history: chatHistory
        }),
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      push("system", data.reply || "No response generated.");
    } catch (err: any) {
      console.error("Chat error:", err);
      push("system", `Error reaching backend: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full flex items-center justify-center z-50 border-none cursor-pointer"
        style={{ background: T.primaryStrong, color: "#fff", boxShadow: "0 10px 30px -8px rgba(90, 95, 181, 0.5)" }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
      {open && (
        <div
          className="fixed bottom-24 right-6 w-[calc(100vw-3rem)] sm:w-[380px] h-[500px] rounded-2xl border flex flex-col z-50 overflow-hidden crcc-fade"
          style={{ backgroundColor: T.surface, borderColor: T.border, boxShadow: "0 24px 60px -20px rgba(20, 15, 50, 0.5)" }}
        >
          <div className="px-5 py-4 flex items-center gap-3" style={{ background: T.hero }}>
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: T.heroPanel, color: T.heroText }}>
              <Sparkles size={17} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: T.heroText }}>Command Center assistant</div>
              <div className="text-xs" style={{ color: T.heroSub }}>Answers across every tab</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 crcc-scroll" style={{ backgroundColor: T.bg }}>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="text-sm rounded-2xl px-3.5 py-2.5 max-w-[85%] leading-relaxed whitespace-pre-wrap"
                  style={
                    m.role === "user"
                      ? { backgroundColor: T.primaryStrong, color: "#fff", borderBottomRightRadius: 6 }
                      : { backgroundColor: T.surface, color: T.text, border: `1px solid ${T.border}`, borderBottomLeftRadius: 6 }
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs" style={{ color: T.sub }}>
                <Loader2 size={13} className="animate-spin" /> Thinking
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: T.border, backgroundColor: T.surface }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about stock, demand or risk"
              className="flex-1 rounded-xl px-3.5 py-2.5 text-sm"
              style={{ backgroundColor: T.surfaceAlt, color: T.text, border: `1px solid ${T.border}` }}
            />
            <button
              onClick={send}
              aria-label="Send"
              className="h-10 w-10 border-none rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              style={{ backgroundColor: T.primaryStrong, color: "#fff" }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ComprehensiveRetailCommandCenter() {
  const [tab, setTab] = useState<TabId>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [isDark, setIsDark] = useState(false);
  const T = isDark ? T_DARK : T_LIGHT;

  const [demandRows, setDemandRows] = useState<DemandRow[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [metrics, setMetrics] = useState<ExecMetric[]>([]);
  const [impact, setImpact] = useState<BeforeAfterRow[]>([]);
  const [rules, setRules] = useState<any>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resDemand, resStock, resMetrics, resImpact, resRules, resCount] = await Promise.all([
          fetch(`${API}/demand`).then((r) => r.json()),
          fetch(`${API}/stock`).then((r) => r.json()),
          fetch(`${API}/kpi`).then((r) => r.json()),
          fetch(`${API}/impact`).then((r) => r.json()),
          fetch(`${API}/rules`).then((r) => r.json()),
          fetch(`${API}/recommendations/count`).then((r) => r.json()),
        ]);
        setDemandRows(Array.isArray(resDemand) ? resDemand : []);
        setStockRows(Array.isArray(resStock) ? resStock : []);
        setMetrics(Array.isArray(resMetrics) ? resMetrics : []);
        setImpact(Array.isArray(resImpact) ? resImpact : []);
        setRules(resRules.error ? { automation: [], guardrails: [] } : resRules);
        setPendingCount(resCount?.count ?? 0);
      } catch (err) {
        console.error("Failed to fetch data from Supabase Postgres backend", err);
      }
    };
    fetchData();
  }, []);

  const [statuses] = useState<Record<string, AgentStatus>>({
    forecast: "idle",
    allocation: "idle",
    validation: "idle",
    execution: "idle",
  });

  const runPipeline = async () => {
    try {
      const response = await fetch(`${API}/run-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      
      if (response.ok) {
        alert("Data processing pipeline has been successfully triggered!");
      } else {
        alert("Error triggering pipeline.");
      }
    } catch (e) {
      console.error("Failed to trigger backend pipeline:", e);
      alert("Failed to trigger the pipeline.");
    }
  };


  return (
    <div className="crcc-root min-h-screen w-full flex flex-col" style={{ backgroundColor: T.bg, color: T.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* Header with Navigation */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ backgroundColor: isDark ? "rgba(22, 22, 43, 0.88)" : "rgba(247, 245, 251, 0.9)", borderColor: T.border }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 lg:px-10 py-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: T.sideLogoBg, color: T.sideLogoText }}>
              <Leaf size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="crcc-serif text-xl font-semibold truncate" style={{ color: T.text }}>Cognitive Retail Command Center</h1>
              <p className="text-xs mt-0.5" style={{ color: T.sub }}>Live data from Supabase Postgres</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDark(!isDark)}
              aria-label="Toggle theme"
              className="flex items-center justify-center w-10 h-10 rounded-xl border cursor-pointer"
              style={{ backgroundColor: T.surface, color: T.text, borderColor: T.border, boxShadow: T.shadow }}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center justify-center w-10 h-10 rounded-xl border cursor-pointer"
              title="View Agents Pipeline"
              style={{ backgroundColor: T.surface, color: T.text, borderColor: T.border, boxShadow: T.shadow }}
            >
              <Activity size={17} />
            </button>
            {/* Removed run agents button as requested */}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto px-6 lg:px-10 pb-3 crcc-scroll">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: tab === t.id ? T.primaryStrong : T.surface,
                color: tab === t.id ? "#fff" : T.sub,
                border: `1px solid ${tab === t.id ? T.primaryStrong : T.border}`,
              }}
            >
              <t.icon size={14} />
              {t.label}
              {t.id === "recommendations" && pendingCount > 0 && (
                <span 
                  className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: tab === t.id ? "rgba(255,255,255,0.3)" : T.high,
                    color: "#fff"
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 lg:px-10 py-6 pb-28 w-full max-w-[1400px] mx-auto crcc-fade" key={tab}>
          {tab === "overview" && (
            <OverviewTab
              theme={T}
              metrics={metrics}
              impact={impact}
            />
          )}
          {tab === "demand" && <DemandMonitoringTab theme={T} data={demandRows} />}
          {tab === "stock" && <StockRegionsTab theme={T} data={stockRows} />}
          {tab === "recommendations" && (
            <RecommendationsTab theme={T} />
          )}
          {tab === "guardrails" && <GuardrailsTab theme={T} rules={rules} />}
        </div>
      </main>

      <PipelineDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} statuses={statuses} theme={T} />
      <GlobalChatbot onTriggerPipeline={runPipeline} theme={T} />
    </div>
  );
}