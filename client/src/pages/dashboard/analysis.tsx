import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Eye, ArrowLeft, Thermometer, Wind, RefreshCw, Settings,
  TrendingUp, AlertCircle, CheckCircle, ExternalLink,
  Server, Flame, Gauge, Zap, Printer, FileText,
} from "lucide-react";
import { useLocation } from "wouter";
import VTKViewer from "@/components/visualization/VTKViewer";
import type { Simulation } from "@shared/schema";

// ── IndoorSpaces types ──────────────────────────────────────────────────────
interface ComfortPlane {
  comfort_area_pct: number;
  pmv_mean: number;
  pmv_std: number;
  ppd_mean: number;
  ppd_max: number;
  n_points: number;
  height_m: number;
}
interface ComfortMetrics { seated: ComfortPlane; standing: ComfortPlane; head: ComfortPlane; }

interface FlowPlane {
  T_mean: number;
  U_mean: number;
  U_comfort_pct: number;
  T_comfort_pct: number;
  DR_mean?: number;
  DR_max?: number;
  DR_high_risk_pct?: number;
}
interface FlowMetrics {
  ankle?: FlowPlane; seated: FlowPlane; standing: FlowPlane; head: FlowPlane;
  vertical_gradient?: { compliant_ISO_7730_A: boolean; compliant_ASHRAE_55: boolean; delta_T_head_ankle: number };
}

interface VentPlane { ADPI_pct: number; CO2_compliant_pct: number; stagnation_pct: number; }
interface VentGlobal {
  ACH?: number;
  ev?: number;
  mean_age?: number;
  CO2_mean?: number;
  CO2_max?: number;
  ev_method?: string;
  volume_m3?: number;
}
interface VentMetrics {
  seated: VentPlane;
  standing: VentPlane;
  head?: VentPlane;
  global?: VentGlobal;
}

// ── DataCenter types ────────────────────────────────────────────────────────
interface RackMetric {
  T_inlet_mean: number;
  T_inlet_p50: number;
  T_inlet_p95: number;
  T_inlet_p99: number;
  T_inlet_max: number;
  T_outlet_mean: number;
  delta_T: number;
  power_kW: number;
  airflow_m3s: number;
  ashrae_ok: boolean;
  ashrae_class: string;
}
interface DcMetrics {
  rack_metrics: Record<string, RackMetric>;
  rci: {
    RCI_HI: number;
    RCI_LO: number;
    n_racks: number;
    n_ashrae_ok: number;
    T_inlet_p50: number;
    T_inlet_p95: number;
    T_inlet_p99: number;
    T_inlet_max: number;
  };
  rti: {
    RTI: number;
    T_supply_mean: number;
    T_return_mean: number;
    T_IT_outlet_mean: number;
    interpretation: string;
  };
  cooling_efficiency: {
    eta_cooling: number;
    pPUE_thermal: number | null;
    Q_IT_kW: number;
    Q_CRAC_kW: number;
    T_supply: number;
    T_return_mean: number;
    delta_T_crac: number;
    quality: string;
  };
  shi_rhi?: {
    SHI: number | null;
    RHI: number | null;
    SHI_quality: string;
    RHI_quality: string;
    T_supply_design: number;
    T_return_design: number;
    T_supply_actual: number;
    T_return_actual: number;
  };
  slice_results: Record<string, {
    height_m: number;
    T_mean: number;
    T_p95: number;
    T_max: number;
    hot_spot_pct: number;
    U_mean: number;
    U_max: number;
    stagnation_pct: number;
  }>;
}

// ── IndustrialCooling (Cold Room) types ─────────────────────────────────────
interface ColdRoomSlice {
  height_m: number;
  plane_name?: string;
  empty?: boolean;
  T_mean: number;
  T_std: number;
  T_min: number;
  T_max: number;
  T_p05: number;
  T_p95: number;
  U_mean: number;
  U_max?: number;
  U_std?: number;
  pct_stagnation: number;
  pct_high_vel?: number;
  VUI?: number;
}
interface ColdRoomMetrics {
  t_setpoint_inferred: number;
  room_type: "refrigeration" | "freezing" | "unknown";
  slices: {
    low: ColdRoomSlice;
    mid: ColdRoomSlice;
    high: ColdRoomSlice;
  };
  energy: {
    ACH: number;
    Q_transmission_W: number;
    volume_m3: number;
  };
  evaporator: {
    ADE: number | null;
    U_mean_discharge: number | null;
    U_mean_product: number | null;
  };
}

// ── Report definitions ─────────────────────────────────────────────────────
interface ReportDef {
  id: string;
  name: string;
  desc: string;
  file: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}

const IS_REPORTS: ReportDef[] = [
  {
    id: "comfort",
    name: "Comfort Report",
    desc: "PMV/PPD thermal comfort analysis — ISO 7730",
    file: "comfort_report.html",
    icon: Thermometer,
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-100",
  },
  {
    id: "flow",
    name: "Flow Report",
    desc: "Airflow distribution and velocity fields",
    file: "flow_report.html",
    icon: Wind,
    color: "text-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-100",
  },
  {
    id: "ventilation",
    name: "Ventilation Report",
    desc: "Air changes, CO₂ concentration and fresh air rates",
    file: "ventilation_report.html",
    icon: RefreshCw,
    color: "text-purple-500",
    bg: "bg-purple-50",
    border: "border-purple-100",
  },
  {
    id: "setup",
    name: "Setup Report",
    desc: "Simulation configuration, mesh and solver settings",
    file: "setup_report.html",
    icon: Settings,
    color: "text-green-500",
    bg: "bg-green-50",
    border: "border-green-100",
  },
];

const DC_REPORTS: ReportDef[] = [
  {
    id: "dc_rack",
    name: "Rack Thermal Analysis",
    desc: "Inlet/outlet temperatures, ASHRAE class and RCI/RTI metrics per rack",
    file: "dc_rack_report.html",
    icon: Server,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
  },
  {
    id: "dc_thermal",
    name: "Thermal Map",
    desc: "Temperature distribution slices at rack bottom, mid and top heights",
    file: "dc_thermal_report.html",
    icon: Flame,
    color: "text-orange-500",
    bg: "bg-orange-50",
    border: "border-orange-100",
  },
  {
    id: "dc_airflow",
    name: "Airflow Analysis",
    desc: "Velocity fields, hot-spot zones and stagnation areas across the data center",
    file: "dc_airflow_report.html",
    icon: Wind,
    color: "text-teal-500",
    bg: "bg-teal-50",
    border: "border-teal-100",
  },
];

const CR_REPORTS: ReportDef[] = [
  {
    id: "cr_thermal",
    name: "Thermal Uniformity",
    desc: "Temperature distribution across horizontal slices, TNU and hot/cold spot analysis",
    file: "cr_thermal_report.html",
    icon: Thermometer,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-100",
  },
  {
    id: "cr_airflow",
    name: "Airflow Distribution",
    desc: "Velocity fields, stagnation zones and evaporator discharge uniformity",
    file: "cr_airflow_report.html",
    icon: Wind,
    color: "text-teal-500",
    bg: "bg-teal-50",
    border: "border-teal-100",
  },
  {
    id: "cr_energy",
    name: "Energy & Infiltration",
    desc: "Transmission loads, ACH and estimated infiltration heat gains",
    file: "cr_energy_report.html",
    icon: Zap,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-100",
  },
  {
    id: "cr_summary",
    name: "Executive Summary",
    desc: "Full performance overview with compliance status for all cold room KPIs",
    file: "cr_summary_report.html",
    icon: FileText,
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
];

// ── Shared helpers ──────────────────────────────────────────────────────────
type StatusColor = "green" | "yellow" | "red";

function fmt(v: number, decimals = 1) { return v.toFixed(decimals); }

// ── DC status helpers ──────────────────────────────────────────────────────
function rciStatus(v: number): StatusColor {
  if (v >= 91) return "green";
  if (v >= 75) return "yellow";
  return "red";
}
function rciLabel(v: number): string {
  if (v >= 91) return "Excellent ≥91%";
  if (v >= 75) return "Acceptable ≥75%";
  return "Poor <75%";
}
function rtiStatus(v: number): StatusColor {
  if (v >= 0.9 && v <= 1.1) return "green";
  if (v >= 0.8 && v <= 1.2) return "yellow";
  return "red";
}
function rtiLabel(v: number): string {
  if (v >= 0.9 && v <= 1.1) return "Balanced (0.9–1.1)";
  if (v >= 0.8 && v <= 1.2) return "Acceptable (0.8–1.2)";
  return v > 1.1 ? "Recirculation risk" : "Bypass / mixing";
}
function etaStatus(v: number): StatusColor {
  if (v >= 80) return "green";
  if (v >= 50) return "yellow";
  return "red";
}
function etaLabel(v: number): string {
  if (v >= 80) return "Good ≥80%";
  if (v >= 50) return "Moderate ≥50%";
  return "Poor — bypass losses";
}
function shiStatus(v: number | null): StatusColor {
  if (v === null) return "yellow";
  if (v < 0.1) return "green";
  if (v < 0.2) return "yellow";
  return "red";
}
function shiLabel(v: number | null, q?: string): string {
  if (v === null) return "N/A";
  return q ?? (v < 0.1 ? "Excellent" : v < 0.2 ? "Good" : "Poor — recirculation");
}
function rhiStatus(v: number | null): StatusColor {
  if (v === null) return "yellow";
  if (v < 0.1) return "green";
  if (v < 0.2) return "yellow";
  return "red";
}
function rhiLabel(v: number | null, q?: string): string {
  if (v === null) return "N/A";
  return q ?? (v < 0.1 ? "Excellent" : v < 0.2 ? "Good" : "Poor — bypass");
}
function pPUEStatus(v: number | null): StatusColor {
  if (v === null) return "yellow";
  if (v <= 1.2) return "green";
  if (v <= 1.5) return "yellow";
  return "red";
}
function pPUELabel(v: number | null): string {
  if (v === null) return "N/A";
  if (v <= 1.2) return "Excellent ≤1.20";
  if (v <= 1.5) return "Acceptable ≤1.50";
  return "Poor >1.50";
}

// ── IS status helpers ──────────────────────────────────────────────────────
function comfortStatus(v: number): StatusColor {
  if (v >= 80) return "green";
  if (v >= 50) return "yellow";
  return "red";
}
function comfortLabel(v: number): string {
  if (v >= 80) return "Comfortable ≥80%";
  if (v >= 50) return "Acceptable ≥50%";
  return "Deficient <50%";
}

function drStatus(v: number): StatusColor {
  if (v < 10) return "green";
  if (v < 20) return "yellow";
  return "red";
}
function drLabel(v: number): string {
  if (v < 10) return "Low risk <10%";
  if (v < 20) return "Moderate <20%";
  return "High risk ≥20%";
}

function velStatus(v: number): StatusColor {
  if (v <= 0.2) return "green";
  if (v <= 0.25) return "yellow";
  return "red";
}
function velLabel(v: number): string {
  if (v <= 0.2) return "Optimal ≤0.20 m/s";
  if (v <= 0.25) return "Acceptable ≤0.25 m/s";
  return "Elevated >0.25 m/s";
}

function tempStatus(v: number): StatusColor {
  if (v >= 20 && v <= 26) return "green";
  if (v >= 18 && v <= 28) return "yellow";
  return "red";
}
function tempLabel(v: number): string {
  if (v >= 20 && v <= 26) return "In comfort range";
  if (v >= 18 && v <= 28) return "Near limits";
  return "Outside comfort range";
}

function adpiStatus(v: number): StatusColor {
  if (v >= 80) return "green";
  if (v >= 60) return "yellow";
  return "red";
}
function adpiLabel(v: number): string {
  if (v >= 80) return "Good ≥80%";
  if (v >= 60) return "Acceptable ≥60%";
  return "Poor <60%";
}

// ev via transient_decay: ratio τ_ideal/τ_actual — higher is better
// ev ≥ 3 = Excellent (very fast CO₂ removal), ≥ 1 = Good, < 1 = Poor
function evStatus(ev: number, method?: string): StatusColor {
  if (method === "transient_decay") {
    if (ev >= 3) return "green";
    if (ev >= 1) return "yellow";
    return "red";
  }
  // classical ev
  if (ev >= 1.2) return "green";
  if (ev >= 0.8) return "yellow";
  return "red";
}
function evLabel(ev: number, method?: string): string {
  if (method === "transient_decay") {
    if (ev >= 3) return "Excellent mixing";
    if (ev >= 1) return "Good";
    return "Poor — stagnation";
  }
  if (ev >= 1.2) return "Displacement flow";
  if (ev >= 0.8) return "Good mixing";
  return "Poor — short-circuit";
}

// ── CR (Cold Room) status helpers ───────────────────────────────────────────
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

function crComplianceStatus(v: number): StatusColor {
  if (v >= 95) return "green";
  if (v >= 80) return "yellow";
  return "red";
}
function crComplianceLabel(v: number): string {
  if (v >= 95) return "Compliant ≥95%";
  if (v >= 80) return "Marginal ≥80%";
  return "Non-compliant <80%";
}

function crTnuStatus(v: number, roomType: string): StatusColor {
  const limit = roomType === "freezing" ? 3 : 2;
  if (v < limit) return "green";
  if (v < limit * 2) return "yellow";
  return "red";
}
function crTnuLabel(v: number, roomType: string): string {
  const limit = roomType === "freezing" ? 3 : 2;
  if (v < limit) return `Uniform <${limit}°C`;
  if (v < limit * 2) return `Moderate <${limit * 2}°C`;
  return `High ΔT ≥${limit * 2}°C`;
}

function crSpotStatus(v: number): StatusColor {
  if (v < 5) return "green";
  if (v < 15) return "yellow";
  return "red";
}
function crSpotLabel(v: number): string {
  if (v < 5) return "Acceptable <5%";
  if (v < 15) return "Moderate <15%";
  return "High ≥15%";
}

function crStagnationStatus(v: number): StatusColor {
  if (v < 15) return "green";
  if (v < 25) return "yellow";
  return "red";
}
function crStagnationLabel(v: number): string {
  if (v < 15) return "Good <15%";
  if (v < 25) return "Moderate <25%";
  return "Poor ≥25%";
}

// ── DC KPI card (used for DataCenters) ─────────────────────────────────────
function DcKpiCard({
  label, value, sub, status, icon: Icon,
}: {
  label: string; value: string; sub?: string; status: StatusColor; icon?: React.ComponentType<{ className?: string }>;
}) {
  const colors: Record<StatusColor, { badge: string; icon: string; border: string }> = {
    green:  { badge: "bg-green-100 text-green-800 border-green-200", icon: "text-green-500", border: "border-l-green-400" },
    yellow: { badge: "bg-amber-100 text-amber-800 border-amber-200",  icon: "text-amber-500",  border: "border-l-amber-400" },
    red:    { badge: "bg-red-100 text-red-800 border-red-200",        icon: "text-red-500",    border: "border-l-red-400" },
  };
  const c = colors[status];
  return (
    <div className={`flex flex-col gap-1 rounded-xl border bg-white px-5 py-4 shadow-sm border-l-4 ${c.border}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 ${c.icon}`} />}
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <span className="text-2xl font-bold text-slate-800 leading-none">{value}</span>
      {sub !== undefined && (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mt-1 border w-fit ${c.badge}`}>
          {status === "green" && <CheckCircle className="h-3 w-3" />}
          {status !== "green" && <AlertCircle className="h-3 w-3" />}
          {sub}
        </span>
      )}
    </div>
  );
}

// ── IS KPI card (secondary metrics for IndoorSpaces) ───────────────────────
function IsKpiCard({
  label, value, sub, status, icon: Icon,
}: {
  label: string; value: string; sub: string; status: StatusColor; icon?: React.ComponentType<{ className?: string }>;
}) {
  const colors: Record<StatusColor, { badge: string; icon: string; border: string }> = {
    green:  { badge: "bg-green-100 text-green-800 border-green-200", icon: "text-green-500", border: "border-l-green-400" },
    yellow: { badge: "bg-amber-100 text-amber-800 border-amber-200",  icon: "text-amber-500",  border: "border-l-amber-400" },
    red:    { badge: "bg-red-100 text-red-800 border-red-200",        icon: "text-red-500",    border: "border-l-red-400" },
  };
  const c = colors[status];
  return (
    <div className={`flex flex-col gap-1 rounded-xl border bg-white px-4 py-4 shadow-sm border-l-4 ${c.border}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`h-3.5 w-3.5 ${c.icon}`} />}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <span className="text-xl font-bold text-slate-800 leading-none">{value}</span>
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 border w-fit ${c.badge}`}>
        {status === "green" ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {sub}
      </span>
    </div>
  );
}

// ── Comfort hero card (star KPI for IndoorSpaces) ──────────────────────────
function ComfortHeroCard({
  comfortPct, pmvMean, ppd, status,
}: {
  comfortPct: number; pmvMean: number; ppd?: number; status: StatusColor;
}) {
  const colors: Record<StatusColor, { bg: string; bar: string; badge: string; border: string; text: string }> = {
    green:  { bg: "bg-green-50",  bar: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200", border: "border-l-green-500",  text: "text-green-700" },
    yellow: { bg: "bg-amber-50",  bar: "bg-amber-500",  badge: "bg-amber-100 text-amber-800 border-amber-200", border: "border-l-amber-500",  text: "text-amber-700" },
    red:    { bg: "bg-red-50",    bar: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200",       border: "border-l-red-500",    text: "text-red-700" },
  };
  const c = colors[status];
  return (
    <div className={`rounded-xl border ${c.bg} ${c.border} border-l-4 shadow-sm px-6 py-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Thermometer className={`h-4 w-4 ${c.text}`} />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Thermal Comfort Area</span>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${c.badge}`}>
          {status === "green" ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {comfortLabel(comfortPct)}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-black text-slate-800 leading-none">{fmt(comfortPct, 0)}%</span>
        <div className="flex flex-col gap-0.5 mb-0.5">
          <span className="text-[11px] text-slate-500">of occupied area</span>
          <span className="text-[11px] text-slate-500">within PMV −0.5 to +0.5</span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full bg-white/70 rounded-full h-2.5 overflow-hidden border border-white">
        <div
          className={`h-full rounded-full transition-all ${c.bar}`}
          style={{ width: `${Math.min(comfortPct, 100)}%` }}
        />
      </div>
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span>PMV mean: <span className="font-semibold text-slate-700">{fmt(pmvMean, 2)}</span> · seated plane</span>
        {ppd !== undefined && (
          <span>PPD mean: <span className="font-semibold text-slate-700">{fmt(ppd, 0)}%</span></span>
        )}
      </div>
    </div>
  );
}

// ── Executive Summary panel ────────────────────────────────────────────────
interface SummaryRow {
  label: string;
  value: string;
  note: string;
  status: StatusColor;
}

function ExecSummary({
  rows, simName, onPrint,
}: {
  rows: SummaryRow[]; simName: string; onPrint: () => void;
}) {
  const dot: Record<StatusColor, string> = {
    green:  "bg-green-500",
    yellow: "bg-amber-400",
    red:    "bg-red-500",
  };
  const textColor: Record<StatusColor, string> = {
    green:  "text-green-700",
    yellow: "text-amber-700",
    red:    "text-red-700",
  };
  return (
    <div id="is-exec-summary" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Executive Summary</span>
          <span className="text-[11px] text-slate-400 ml-1">— {simName}</span>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          Download PDF
        </Button>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center px-5 py-2.5 gap-3">
            <span className={`flex-shrink-0 w-2 h-2 rounded-full ${dot[row.status]}`} />
            <span className="text-xs text-slate-600 flex-1">{row.label}</span>
            <span className="text-sm font-semibold text-slate-800 w-28 text-right">{row.value}</span>
            <span className={`text-[11px] font-medium w-44 text-right ${textColor[row.status]}`}>{row.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cold Room Config Card ────────────────────────────────────────────────────
interface CrParams {
  tSetpoint: number;
  toleranceHi: number;
  toleranceLo: number;
  cop: string;
  doorWidth: string;
  doorHeight: string;
  openingsPerDay: string;
  tExternal: string;
}

function CrConfigCard({
  params,
  onChange,
  roomType,
}: {
  params: CrParams;
  onChange: (p: CrParams) => void;
  roomType: string;
}) {
  const [showOptional, setShowOptional] = useState(false);
  const roomTypeLabel = roomType === "freezing" ? "Freezing (< −18 °C)" : roomType === "refrigeration" ? "Refrigeration (0 – 8 °C)" : "Unknown";
  const field = (label: string, val: string, key: keyof CrParams, unit: string, step = "0.1") => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={val}
          onChange={e => onChange({ ...params, [key]: e.target.value })}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
        />
        <span className="text-xs text-slate-400 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-100 bg-cyan-50">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-cyan-600" />
          <span className="text-sm font-semibold text-slate-700">Cold Room Parameters</span>
          <span className="text-[11px] text-slate-400 ml-1">— adjust thresholds to recalculate KPIs</span>
        </div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">
          {roomTypeLabel}
        </span>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">T Setpoint</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              value={params.tSetpoint}
              onChange={e => onChange({ ...params, tSetpoint: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
            />
            <span className="text-xs text-slate-400 whitespace-nowrap">°C</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tolerance +</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              value={params.toleranceHi}
              onChange={e => onChange({ ...params, toleranceHi: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
            />
            <span className="text-xs text-slate-400 whitespace-nowrap">°C</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tolerance −</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              value={params.toleranceLo}
              onChange={e => onChange({ ...params, toleranceLo: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
            />
            <span className="text-xs text-slate-400 whitespace-nowrap">°C</span>
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 flex items-end">
          <button
            onClick={() => setShowOptional(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 hover:text-cyan-800 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            {showOptional ? "Hide" : "Show"} optional fields (SEC / Q_infiltration)
          </button>
        </div>
      </div>
      {showOptional && (
        <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 border-t border-cyan-100 pt-4">
          {field("COP Evaporator", params.cop, "cop", "", "0.1")}
          {field("Door width", params.doorWidth, "doorWidth", "m", "0.1")}
          {field("Door height", params.doorHeight, "doorHeight", "m", "0.1")}
          {field("Openings / day", params.openingsPerDay, "openingsPerDay", "n", "1")}
          {field("T external", params.tExternal, "tExternal", "°C", "0.5")}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Analysis() {
  const [, params] = useRoute("/dashboard/analysis/:id");
  const [, setLocation] = useLocation();
  const simulationId = params?.id ? parseInt(params.id, 10) : null;

  const [openReport, setOpenReport] = useState<ReportDef | null>(null);
  const [comfortZoneError, setComfortZoneError] = useState(false);
  const [dcZoneHeight, setDcZoneHeight] = useState<"bottom_rack_0.5m" | "mid_rack_1.0m" | "top_rack_1.5m">("mid_rack_1.0m");
  const [dcAshraeError, setDcAshraeError] = useState(false);
  const [dcStagError, setDcStagError] = useState(false);

  const [crParams, setCrParams] = useState<CrParams>({
    tSetpoint: 4,
    toleranceHi: 2,
    toleranceLo: 2,
    cop: "",
    doorWidth: "",
    doorHeight: "",
    openingsPerDay: "",
    tExternal: "20",
  });

  const { data: simulation, isLoading, error } = useQuery<Simulation>({
    queryKey: [`/api/simulations/${simulationId}`],
    enabled: simulationId !== null && !isNaN(simulationId!),
  });

  const postUrl = (file: string) => `/api/simulations/${simulationId}/post/${file}`;
  const hasPost = !!simulationId && !isNaN(simulationId);

  const simulationType: string = (simulation?.jsonConfig as Record<string, unknown> | null)?.simulationType as string ?? "IndoorSpaces";
  const isDataCenter = simulationType === "DataCenters";
  const isColdRoom = simulationType === "IndustrialCooling";

  // IndoorSpaces metrics — only after simulation type is known to avoid spurious DC/CR requests
  const { data: comfort } = useQuery<ComfortMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/comfort_metrics.json`],
    enabled: hasPost && !!simulation && !isDataCenter && !isColdRoom,
    queryFn: () => fetch(postUrl("comfort_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: flow } = useQuery<FlowMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/flow_metrics.json`],
    enabled: hasPost && !!simulation && !isDataCenter && !isColdRoom,
    queryFn: () => fetch(postUrl("flow_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: vent } = useQuery<VentMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/ventilation_metrics.json`],
    enabled: hasPost && !!simulation && !isDataCenter && !isColdRoom,
    queryFn: () => fetch(postUrl("ventilation_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  // DataCenter metrics — only after simulation type is known
  const { data: dcMetrics } = useQuery<DcMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/dc_metrics.json`],
    enabled: hasPost && !!simulation && isDataCenter,
    queryFn: () => fetch(postUrl("dc_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  // IndustrialCooling (Cold Room) metrics
  const { data: crMetrics } = useQuery<ColdRoomMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/coldroom_metrics.json`],
    enabled: hasPost && !!simulation && isColdRoom,
    queryFn: () => fetch(postUrl("coldroom_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const hasISMetrics = !!(comfort || flow || vent);
  const hasDCMetrics = !!dcMetrics;
  const hasCRMetrics = !!crMetrics;

  const activeReports = isColdRoom ? CR_REPORTS : isDataCenter ? DC_REPORTS : IS_REPORTS;
  const reportsGridCols = isColdRoom ? "sm:grid-cols-2 lg:grid-cols-4" : isDataCenter ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";

  // DC derived values
  const rci = dcMetrics?.rci;
  const rti = dcMetrics?.rti;
  const eff = dcMetrics?.cooling_efficiency;
  const shiRhi = dcMetrics?.shi_rhi;
  const rackCount = rci ? rci.n_racks : 0;
  const ashraeOk = rci ? rci.n_ashrae_ok : 0;
  const ashraePct = rackCount > 0 ? (ashraeOk / rackCount) * 100 : 0;

  // IS derived values
  const comfortPct = comfort?.seated?.comfort_area_pct ?? 0;
  const pmvMean = comfort?.seated?.pmv_mean ?? 0;
  const ppdMean = comfort?.seated?.ppd_mean;
  const drMean = flow?.ankle?.DR_mean;
  const drHighPct = flow?.ankle?.DR_high_risk_pct;
  const uMean = flow?.seated?.U_mean;
  const tMean = flow?.seated?.T_mean;
  const adpiPct = vent?.seated?.ADPI_pct;
  const ev = vent?.global?.ev;
  const evMethod = vent?.global?.ev_method;
  const ach = vent?.global?.ACH;

  // CR: initialise params from JSON on first load only (useRef guard prevents refetch overwrite)
  const crInitializedRef = useRef(false);
  useEffect(() => {
    if (crMetrics && !crInitializedRef.current) {
      crInitializedRef.current = true;
      setCrParams(prev => ({
        ...prev,
        tSetpoint: crMetrics.t_setpoint_inferred,
      }));
    }
  }, [crMetrics]);

  // CR reactive KPI calculations
  const crKpis = useMemo(() => {
    if (!crMetrics) return null;
    const slices = [crMetrics.slices.low, crMetrics.slices.mid, crMetrics.slices.high]
      .filter(s => !s.empty && s.T_mean !== undefined && s.T_std !== undefined);
    if (slices.length === 0) return null;
    const { tSetpoint, toleranceHi, toleranceLo } = crParams;
    const thHi = tSetpoint + toleranceHi;
    const thLo = tSetpoint - toleranceLo;

    // Temperature compliance: Gaussian-integral estimate of fraction of points inside [thLo, thHi]
    // For each slice: P(thLo ≤ T ≤ thHi) = CDF(thHi) − CDF(thLo) given N(T_mean, T_std)
    // Averaged across the three product-height planes.
    const compliance_pct = slices.reduce((acc, s) => {
      const stdSafe = s.T_std > 0 ? s.T_std : 0.001;
      const p = normalCDF((thHi - s.T_mean) / stdSafe) - normalCDF((thLo - s.T_mean) / stdSafe);
      return acc + Math.max(0, Math.min(1, p)) * 100;
    }, 0) / slices.length;

    // TNU: max T_max − min T_min across slices
    const tnu = Math.max(...slices.map(s => s.T_max)) - Math.min(...slices.map(s => s.T_min));

    // Hot/Cold spot % using normal distribution approximation per slice
    let hotPct = 0, coldPct = 0;
    for (const s of slices) {
      const stdSafe = s.T_std > 0 ? s.T_std : 0.001;
      hotPct += (1 - normalCDF((thHi - s.T_mean) / stdSafe)) * 100;
      coldPct += normalCDF((thLo - s.T_mean) / stdSafe) * 100;
    }
    hotPct /= slices.length;
    coldPct /= slices.length;

    // Stagnation: mean across slices
    const stagnation_pct = slices.reduce((acc, s) => acc + s.pct_stagnation, 0) / slices.length;

    // Q_transmission: direct from energy
    const q_transmission = crMetrics.energy.Q_transmission_W;

    // Optional: Q_infiltration (Gosney-Olama)
    const cop = parseFloat(crParams.cop);
    const dw = parseFloat(crParams.doorWidth);
    const dh = parseFloat(crParams.doorHeight);
    const openings = parseFloat(crParams.openingsPerDay);
    const tExt = parseFloat(crParams.tExternal);

    let q_infiltration: number | null = null;
    let sec: number | null = null;

    if (!isNaN(dw) && dw > 0 && !isNaN(dh) && dh > 0 && !isNaN(openings) && openings > 0 && !isNaN(tExt)) {
      const A = dw * dh;
      const deltaT = Math.abs(tExt - tSetpoint);
      const T_avg_K = ((tExt + tSetpoint) / 2) + 273.15;
      const g = 9.81;
      const rho = 1.293;
      const cp = 1006;
      const t_open_s = 30; // assumed 30 s per opening
      const f_open = (openings * t_open_s) / 86400;
      const v_char = Math.sqrt(2 * g * dh * deltaT / T_avg_K);
      q_infiltration = 0.221 * A * v_char * rho * cp * deltaT * f_open;
    }

    // SEC requires COP *and* a valid Q_infiltration estimate (door data must be filled)
    if (!isNaN(cop) && cop > 0 && q_infiltration !== null && crMetrics.energy.volume_m3 > 0) {
      const q_total = q_transmission + q_infiltration;
      sec = (q_total / cop) * 8760 / 1000 / crMetrics.energy.volume_m3;
    }

    return { compliance_pct, tnu, hotPct, coldPct, stagnation_pct, q_transmission, q_infiltration, sec };
  }, [crMetrics, crParams]);

  // Executive summary rows for IS
  const summaryRows: SummaryRow[] = [];
  if (comfort?.seated) {
    summaryRows.push({
      label: "Thermal Comfort Area (seated · PMV ±0.5)",
      value: `${fmt(comfortPct, 0)}%`,
      note: comfortLabel(comfortPct),
      status: comfortStatus(comfortPct),
    });
  }
  if (drMean !== undefined) {
    summaryRows.push({
      label: "Draft Rate — ankle level (ISO 7730)",
      value: `${fmt(drMean, 1)}%`,
      note: drLabel(drMean),
      status: drStatus(drMean),
    });
  }
  if (uMean !== undefined) {
    summaryRows.push({
      label: "Mean air velocity (seated plane)",
      value: `${fmt(uMean, 2)} m/s`,
      note: velLabel(uMean),
      status: velStatus(uMean),
    });
  }
  if (tMean !== undefined) {
    summaryRows.push({
      label: "Mean air temperature (seated plane)",
      value: `${fmt(tMean, 1)} °C`,
      note: tempLabel(tMean),
      status: tempStatus(tMean),
    });
  }
  if (adpiPct !== undefined) {
    summaryRows.push({
      label: "ADPI — Air Diffusion Performance Index",
      value: `${fmt(adpiPct, 0)}%`,
      note: adpiLabel(adpiPct),
      status: adpiStatus(adpiPct),
    });
  }
  if (ev !== undefined) {
    const evMethodShort = evMethod === "transient_decay" ? "transient decay" : "classical";
    summaryRows.push({
      label: `Ventilation effectiveness εᵥ (${evMethodShort})`,
      value: fmt(ev, evMethod === "transient_decay" ? 1 : 2),
      note: evLabel(ev, evMethod),
      status: evStatus(ev, evMethod),
    });
  }
  if (ach !== undefined) {
    summaryRows.push({
      label: "Air Changes per Hour (ACH)",
      value: `${fmt(ach, 2)} h⁻¹`,
      note: ach >= 6 ? "Adequate ventilation" : ach >= 2 ? "Low — check supply" : "Insufficient",
      status: ach >= 6 ? "green" : ach >= 2 ? "yellow" : "red",
    });
  }

  // PDF print handler
  const handlePrint = useCallback(() => {
    const summaryEl = document.getElementById("is-exec-summary");
    if (!summaryEl) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const simName = simulation?.name ?? "Simulation";
    const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const dot: Record<StatusColor, string> = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };
    const textCol: Record<StatusColor, string> = { green: "#15803d", yellow: "#b45309", red: "#b91c1c" };
    const rowsHtml = summaryRows.map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot[r.status]};margin-right:8px;vertical-align:middle"></span>
          <span style="font-size:12px;color:#475569">${r.label}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:700;color:#1e293b">${r.value}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:11px;font-weight:600;color:${textCol[r.status]}">${r.note}</td>
      </tr>`).join("");
    const imgBase = `${window.location.origin}/api/simulations/${simulationId}/post/images`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>CFD Executive Summary — ${simName}</title>
      <style>
        body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#1e293b;background:#fff}
        h1{font-size:20px;font-weight:800;margin:0 0 4px}
        .meta{font-size:12px;color:#64748b;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
        th{background:#f8fafc;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600}
        th:nth-child(2),th:nth-child(3){text-align:right}
        .zone-section{margin-top:24px;page-break-inside:avoid}
        .zone-section h2{font-size:13px;font-weight:700;color:#1e293b;margin:0 0 4px}
        .zone-section p{font-size:11px;color:#64748b;margin:0 0 10px}
        .zone-images{display:flex;gap:16px;justify-content:center}
        .zone-images figure{margin:0;flex:1;max-width:340px;text-align:center}
        .zone-images img{width:100%;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
        .zone-images figcaption{font-size:10px;color:#94a3b8;margin-top:4px}
        .footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:right}
        @media print{body{padding:16px}.zone-images{flex-direction:row}}
      </style></head><body>
      <h1>CFD Indoor Comfort — Executive Summary</h1>
      <div class="meta">Simulation: <strong>${simName}</strong> &nbsp;·&nbsp; Report date: ${date}</div>
      <table>
        <thead><tr>
          <th>KPI</th><th style="text-align:right">Value</th><th style="text-align:right">Assessment</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="zone-section">
        <h2>Comfort Zone Maps — ISO 7730 · |PMV| ≤ 0.5</h2>
        <p><span style="color:#22c55e;font-weight:700">●</span> Comfortable &nbsp; <span style="color:#ef4444;font-weight:700">●</span> Discomfort</p>
        <div class="zone-images">
          <figure>
            <img src="${imgBase}/comfort_zone_seated.png" onerror="this.closest('figure').style.display='none'" alt="Seated plane comfort zone">
            <figcaption>Seated plane (0.6 m)</figcaption>
          </figure>
          <figure>
            <img src="${imgBase}/comfort_zone_standing.png" onerror="this.closest('figure').style.display='none'" alt="Standing plane comfort zone">
            <figcaption>Standing plane (1.1 m)</figcaption>
          </figure>
        </div>
      </div>
      <div class="footer">Generated by FlowDesk CFD Platform · ${date}</div>
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`);
    w.document.close();
  }, [summaryRows, simulation]);

  return (
    <DashboardLayout>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading simulation data...</div>
      ) : error || !simulation ? (
        <div className="text-center py-16">
          <p className="text-red-600 mb-4">Could not load this simulation.</p>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>Return to Dashboard</Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Header ── */}
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Post &amp; Analysis</h1>
            <Badge variant="secondary" className="text-sm bg-green-100 text-green-800 border-green-200">
              {simulation.status.charAt(0).toUpperCase() + simulation.status.slice(1)}
            </Badge>
            {isDataCenter && (
              <Badge variant="outline" className="text-sm border-blue-200 text-blue-700 bg-blue-50">
                <Server className="h-3 w-3 mr-1" />
                Data Center
              </Badge>
            )}
            {isColdRoom && (
              <Badge variant="outline" className="text-sm border-cyan-200 text-cyan-700 bg-cyan-50">
                <Thermometer className="h-3 w-3 mr-1" />
                Cold Room
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground -mt-4">
            Simulation: <span className="font-medium text-foreground">{simulation.name}</span>
            {simulation.packageType && (
              <Badge variant="outline" className="ml-2 text-xs">{simulation.packageType}</Badge>
            )}
          </p>

          {/* ── Reports section ── */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="h-5 w-5 text-slate-500" />
              <h2 className="text-xl font-semibold">Reports &amp; Metrics</h2>
            </div>

            {/* ── IndoorSpaces KPI section ── */}
            {!isDataCenter && hasISMetrics && (
              <div className="space-y-3 mb-6">
                {/* Hero: Comfort Area */}
                {comfort?.seated && (
                  <ComfortHeroCard
                    comfortPct={comfortPct}
                    pmvMean={pmvMean}
                    ppd={ppdMean}
                    status={comfortStatus(comfortPct)}
                  />
                )}

                {/* Comfort zone map image */}
                {!comfortZoneError && hasPost && (
                  <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b bg-slate-50 flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        Comfort Zone Map — Seated Plane (0.6 m)
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto">ISO 7730 · |PMV| ≤ 0.5</span>
                    </div>
                    <img
                      src={postUrl("images/comfort_zone_seated.png")}
                      alt="Comfort zone map at seated height"
                      className="w-full block"
                      style={{ maxHeight: '420px', objectFit: 'contain', background: 'white' }}
                      onError={() => setComfortZoneError(true)}
                    />
                  </div>
                )}

                {/* Secondary KPIs: DR · Velocity · Temperature · ADPI · ev */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {drMean !== undefined && (
                    <IsKpiCard
                      label="Draft Rate"
                      value={`${fmt(drMean, 1)}%`}
                      sub={drLabel(drMean)}
                      status={drStatus(drMean)}
                      icon={Wind}
                    />
                  )}
                  {uMean !== undefined && (
                    <IsKpiCard
                      label="Mean velocity"
                      value={`${fmt(uMean, 2)} m/s`}
                      sub={`${fmt(flow?.seated?.U_comfort_pct ?? 0, 0)}% in range`}
                      status={velStatus(uMean)}
                      icon={Wind}
                    />
                  )}
                  {tMean !== undefined && (
                    <IsKpiCard
                      label="Mean temp."
                      value={`${fmt(tMean, 1)} °C`}
                      sub={flow?.vertical_gradient
                        ? `ΔT: ${fmt(flow.vertical_gradient.delta_T_head_ankle, 1)} K`
                        : tempLabel(tMean)}
                      status={tempStatus(tMean)}
                      icon={Thermometer}
                    />
                  )}
                  {adpiPct !== undefined && (
                    <IsKpiCard
                      label="ADPI"
                      value={`${fmt(adpiPct, 0)}%`}
                      sub={adpiLabel(adpiPct)}
                      status={adpiStatus(adpiPct)}
                      icon={Gauge}
                    />
                  )}
                  {ev !== undefined && (
                    <IsKpiCard
                      label="εᵥ ventilation"
                      value={fmt(ev, evMethod === "transient_decay" ? 1 : 2)}
                      sub={evLabel(ev, evMethod)}
                      status={evStatus(ev, evMethod)}
                      icon={RefreshCw}
                    />
                  )}
                </div>

                {/* Executive Summary */}
                {summaryRows.length > 0 && (
                  <ExecSummary
                    rows={summaryRows}
                    simName={simulation.name}
                    onPrint={handlePrint}
                  />
                )}
              </div>
            )}

            {/* ── DataCenter KPI row ── */}
            {isDataCenter && hasDCMetrics && rci && rti && eff && (
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <DcKpiCard
                    label="RCI High"
                    value={`${fmt(rci.RCI_HI, 0)}%`}
                    sub={rciLabel(rci.RCI_HI)}
                    status={rciStatus(rci.RCI_HI)}
                    icon={Gauge}
                  />
                  <DcKpiCard
                    label="RCI Low"
                    value={`${fmt(rci.RCI_LO, 0)}%`}
                    sub={rciLabel(rci.RCI_LO)}
                    status={rciStatus(rci.RCI_LO)}
                    icon={Gauge}
                  />
                  <DcKpiCard
                    label="RTI"
                    value={fmt(rti.RTI, 2)}
                    sub={rtiLabel(rti.RTI)}
                    status={rtiStatus(rti.RTI)}
                    icon={TrendingUp}
                  />
                  <DcKpiCard
                    label="η Cooling"
                    value={`${fmt(eff.eta_cooling, 0)}%`}
                    sub={etaLabel(eff.eta_cooling)}
                    status={etaStatus(eff.eta_cooling)}
                    icon={Zap}
                  />
                  <DcKpiCard
                    label="ASHRAE A2"
                    value={`${fmt(ashraePct, 0)}%`}
                    sub={`${ashraeOk}/${rackCount} racks OK`}
                    status={ashraePct === 100 ? "green" : ashraePct >= 50 ? "yellow" : "red"}
                    icon={Server}
                  />
                </div>
                {shiRhi && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <DcKpiCard
                      label="SHI"
                      value={shiRhi.SHI !== null ? fmt(shiRhi.SHI, 3) : "N/A"}
                      sub={shiLabel(shiRhi.SHI, shiRhi.SHI_quality)}
                      status={shiStatus(shiRhi.SHI)}
                      icon={Flame}
                    />
                    <DcKpiCard
                      label="RHI"
                      value={shiRhi.RHI !== null ? fmt(shiRhi.RHI, 3) : "N/A"}
                      sub={rhiLabel(shiRhi.RHI, shiRhi.RHI_quality)}
                      status={rhiStatus(shiRhi.RHI)}
                      icon={Zap}
                    />
                    <DcKpiCard
                      label="pPUE Thermal"
                      value={eff.pPUE_thermal !== null && eff.pPUE_thermal !== undefined ? fmt(eff.pPUE_thermal, 2) : "N/A"}
                      sub={pPUELabel(eff.pPUE_thermal ?? null)}
                      status={pPUEStatus(eff.pPUE_thermal ?? null)}
                      icon={TrendingUp}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Cold Room KPI section ── */}
            {isColdRoom && hasCRMetrics && crKpis && (
              <div className="space-y-4 mb-6">
                <CrConfigCard
                  params={crParams}
                  onChange={setCrParams}
                  roomType={crMetrics!.room_type}
                />
                {/* Primary KPI row — 6 cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <DcKpiCard
                    label="Temp. Compliance"
                    value={`${fmt(crKpis.compliance_pct, 0)}%`}
                    sub={crComplianceLabel(crKpis.compliance_pct)}
                    status={crComplianceStatus(crKpis.compliance_pct)}
                    icon={Thermometer}
                  />
                  <DcKpiCard
                    label="TNU"
                    value={`${fmt(crKpis.tnu, 2)} °C`}
                    sub={crTnuLabel(crKpis.tnu, crMetrics!.room_type)}
                    status={crTnuStatus(crKpis.tnu, crMetrics!.room_type)}
                    icon={TrendingUp}
                  />
                  <DcKpiCard
                    label="Hot Spot"
                    value={`${fmt(crKpis.hotPct, 1)}%`}
                    sub={crSpotLabel(crKpis.hotPct)}
                    status={crSpotStatus(crKpis.hotPct)}
                    icon={Flame}
                  />
                  <DcKpiCard
                    label="Cold Spot"
                    value={`${fmt(crKpis.coldPct, 1)}%`}
                    sub={crSpotLabel(crKpis.coldPct)}
                    status={crSpotStatus(crKpis.coldPct)}
                    icon={AlertCircle}
                  />
                  <DcKpiCard
                    label="Stagnation"
                    value={`${fmt(crKpis.stagnation_pct, 1)}%`}
                    sub={crStagnationLabel(crKpis.stagnation_pct)}
                    status={crStagnationStatus(crKpis.stagnation_pct)}
                    icon={Wind}
                  />
                  <DcKpiCard
                    label="Q transmission"
                    value={`${(crKpis.q_transmission / 1000).toFixed(2)} kW`}
                    sub={`ACH ${fmt(crMetrics!.energy.ACH, 1)} h⁻¹`}
                    status="yellow"
                    icon={Zap}
                  />
                </div>
                {/* Secondary KPI row — SEC & Q_infiltration */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <DcKpiCard
                    label="SEC"
                    value={crKpis.sec !== null ? `${fmt(crKpis.sec, 2)} kWh/m³/y` : "N/A"}
                    sub={crKpis.sec !== null ? "Specific Energy" : "Enter COP to calculate"}
                    status={crKpis.sec !== null ? (crKpis.sec < 80 ? "green" : crKpis.sec < 150 ? "yellow" : "red") : "yellow"}
                    icon={Gauge}
                  />
                  <DcKpiCard
                    label="Q infiltration"
                    value={crKpis.q_infiltration !== null ? `${(crKpis.q_infiltration / 1000).toFixed(2)} kW` : "N/A"}
                    sub={crKpis.q_infiltration !== null ? "Gosney-Olama" : "Enter door data"}
                    status={crKpis.q_infiltration !== null ? (crKpis.q_infiltration < crKpis.q_transmission * 0.2 ? "green" : crKpis.q_infiltration < crKpis.q_transmission * 0.5 ? "yellow" : "red") : "yellow"}
                    icon={RefreshCw}
                  />
                  {crMetrics!.evaporator.ADE !== null && (
                    <DcKpiCard
                      label="ADE Evaporator"
                      value={`${fmt(crMetrics!.evaporator.ADE ?? 0, 2)}`}
                      sub={crMetrics!.evaporator.ADE! >= 0.8 ? "Good ≥0.80" : crMetrics!.evaporator.ADE! >= 0.6 ? "Moderate ≥0.60" : "Poor <0.60"}
                      status={crMetrics!.evaporator.ADE! >= 0.8 ? "green" : crMetrics!.evaporator.ADE! >= 0.6 ? "yellow" : "red"}
                      icon={TrendingUp}
                    />
                  )}
                  {crMetrics!.evaporator.U_mean_discharge !== null && (
                    <DcKpiCard
                      label="U discharge"
                      value={`${fmt(crMetrics!.evaporator.U_mean_discharge ?? 0, 2)} m/s`}
                      sub="Evaporator discharge"
                      status="yellow"
                      icon={Wind}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── DC Zone Maps ── */}
            {isDataCenter && hasPost && !dcAshraeError && !dcStagError && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Spatial Zone Maps</h3>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                    {(["bottom_rack_0.5m", "mid_rack_1.0m", "top_rack_1.5m"] as const).map((h) => (
                      <button
                        key={h}
                        onClick={() => { setDcZoneHeight(h); setDcAshraeError(false); setDcStagError(false); }}
                        className={`px-3 py-1.5 font-medium transition-colors ${dcZoneHeight === h ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {h === "bottom_rack_0.5m" ? "z = 0.5 m" : h === "mid_rack_1.0m" ? "z = 1.0 m" : "z = 1.5 m"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">ASHRAE A2 Zone Map</span>
                    </div>
                    <img
                      src={`${postUrl(`images/dc_ashrae_zone_${dcZoneHeight}.png`)}`}
                      alt="ASHRAE temperature zone map"
                      className="w-full"
                      onError={() => setDcAshraeError(true)}
                    />
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Stagnation Zone Map</span>
                    </div>
                    <img
                      src={`${postUrl(`images/dc_stagnation_zone_${dcZoneHeight}.png`)}`}
                      alt="Stagnation zone map"
                      className="w-full"
                      onError={() => setDcStagError(true)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Report cards ── */}
            <div className={`grid gap-4 ${reportsGridCols}`}>
              {activeReports.map((report) => {
                const Icon = report.icon;
                return (
                  <button
                    key={report.id}
                    onClick={() => setOpenReport(report)}
                    className={`group text-left rounded-xl border ${report.border} bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden`}
                  >
                    <div className={`${report.bg} px-5 py-4 flex items-center gap-3 border-b ${report.border}`}>
                      <div className={`rounded-lg ${report.bg} p-2`}>
                        <Icon className={`h-5 w-5 ${report.color}`} />
                      </div>
                      <span className="font-semibold text-slate-800 text-sm">{report.name}</span>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-xs text-slate-500 leading-relaxed mb-3">{report.desc}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${report.color} group-hover:underline`}>
                        View report <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 3D Viewer ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                3D Visualization
              </CardTitle>
              <CardDescription>Interactive 3D visualization of simulation results</CardDescription>
            </CardHeader>
            <CardContent>
              <VTKViewer simulationId={simulation.id} className="w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report Sheet (iframe panel) ── */}
      <Sheet open={!!openReport} onOpenChange={(o) => { if (!o) setOpenReport(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-5xl p-0 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 py-3 border-b shrink-0 flex-row items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              {openReport && (() => { const Icon = openReport.icon; return <Icon className={`h-5 w-5 ${openReport.color}`} />; })()}
              {openReport?.name}
            </SheetTitle>
            {openReport && simulationId && (
              <a
                href={postUrl(openReport.file)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-8"
              >
                <ExternalLink className="h-3 w-3" />
                Open in new tab
              </a>
            )}
          </SheetHeader>
          {openReport && simulationId && (
            <iframe
              key={openReport.id}
              src={postUrl(openReport.file)}
              title={openReport.name}
              style={{ width: '100%', height: 'calc(100dvh - 57px)', border: 'none', display: 'block' }}
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
