import { useState } from "react";
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
  Server, Flame, Gauge, Zap,
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
}
interface FlowMetrics {
  ankle?: FlowPlane; seated: FlowPlane; standing: FlowPlane; head: FlowPlane;
  vertical_gradient?: { compliant_ISO_7730_A: boolean; compliant_ASHRAE_55: boolean; delta_T_head_ankle: number };
}

interface VentPlane { ADPI_pct: number; CO2_compliant_pct: number; stagnation_pct: number; }
interface VentMetrics { seated: VentPlane; standing: VentPlane; }

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
    Q_IT_kW: number;
    Q_CRAC_kW: number;
    T_supply: number;
    T_return_mean: number;
    delta_T_crac: number;
    quality: string;
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

// ── Small helpers ──────────────────────────────────────────────────────────
type StatusColor = "green" | "yellow" | "red";

function KpiCard({
  label, value, sub, ok,
}: {
  label: string; value: string; sub?: string; ok?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-white px-5 py-4 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-2xl font-bold text-slate-800 leading-none">{value}</span>
      {sub !== undefined && (
        <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
          {ok === true && <CheckCircle className="h-3 w-3 text-green-500" />}
          {ok === false && <AlertCircle className="h-3 w-3 text-amber-500" />}
          {sub}
        </span>
      )}
    </div>
  );
}

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

function fmt(v: number, decimals = 1) { return v.toFixed(decimals); }

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

// ── Main page ──────────────────────────────────────────────────────────────
export default function Analysis() {
  const [, params] = useRoute("/dashboard/analysis/:id");
  const [, setLocation] = useLocation();
  const simulationId = params?.id ? parseInt(params.id, 10) : null;

  const [openReport, setOpenReport] = useState<ReportDef | null>(null);

  const { data: simulation, isLoading, error } = useQuery<Simulation>({
    queryKey: [`/api/simulations/${simulationId}`],
    enabled: simulationId !== null && !isNaN(simulationId!),
  });

  const postUrl = (file: string) => `/api/simulations/${simulationId}/post/${file}`;
  const hasPost = !!simulationId && !isNaN(simulationId);

  const simulationType: string = (simulation?.jsonConfig as Record<string, unknown> | null)?.simulationType as string ?? "IndoorSpaces";
  const isDataCenter = simulationType === "DataCenters";

  // IndoorSpaces metrics — only after simulation type is known to avoid spurious DC requests
  const { data: comfort } = useQuery<ComfortMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/comfort_metrics.json`],
    enabled: hasPost && !!simulation && !isDataCenter,
    queryFn: () => fetch(postUrl("comfort_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: flow } = useQuery<FlowMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/flow_metrics.json`],
    enabled: hasPost && !!simulation && !isDataCenter,
    queryFn: () => fetch(postUrl("flow_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: vent } = useQuery<VentMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/ventilation_metrics.json`],
    enabled: hasPost && !!simulation && !isDataCenter,
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

  const hasISMetrics = !!(comfort || flow || vent);
  const hasDCMetrics = !!dcMetrics;

  const activeReports = isDataCenter ? DC_REPORTS : IS_REPORTS;
  const reportsGridCols = isDataCenter ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";

  // DC derived values
  const rci = dcMetrics?.rci;
  const rti = dcMetrics?.rti;
  const eff = dcMetrics?.cooling_efficiency;
  const rackCount = rci ? rci.n_racks : 0;
  const ashraeOk = rci ? rci.n_ashrae_ok : 0;
  const ashraePct = rackCount > 0 ? (ashraeOk / rackCount) * 100 : 0;

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
          </div>
          <p className="text-muted-foreground -mt-4">
            Simulation: <span className="font-medium text-foreground">{simulation.name}</span>
            {simulation.packageType && (
              <Badge variant="outline" className="ml-2 text-xs">{simulation.packageType}</Badge>
            )}
          </p>

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

          {/* ── Reports section ── */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="h-5 w-5 text-slate-500" />
              <h2 className="text-xl font-semibold">Reports &amp; Metrics</h2>
            </div>

            {/* ── IndoorSpaces KPI row ── */}
            {!isDataCenter && hasISMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {comfort?.seated && (
                  <KpiCard
                    label="Comfort area"
                    value={`${fmt(comfort.seated.comfort_area_pct, 0)}%`}
                    sub={`PMV ${fmt(comfort.seated.pmv_mean)} · seated plane`}
                    ok={comfort.seated.comfort_area_pct >= 50}
                  />
                )}
                {flow?.seated && (
                  <KpiCard
                    label="Mean velocity"
                    value={`${fmt(flow.seated.U_mean, 2)} m/s`}
                    sub={`${fmt(flow.seated.U_comfort_pct, 0)}% in comfort range`}
                    ok={flow.seated.U_mean < 0.25}
                  />
                )}
                {flow?.seated && (
                  <KpiCard
                    label="Mean temperature"
                    value={`${fmt(flow.seated.T_mean, 1)} °C`}
                    sub={flow.vertical_gradient
                      ? `ΔT head-ankle: ${fmt(flow.vertical_gradient.delta_T_head_ankle, 1)} K`
                      : undefined}
                    ok={flow.seated.T_mean >= 20 && flow.seated.T_mean <= 26}
                  />
                )}
                {vent?.seated && (
                  <KpiCard
                    label="ADPI"
                    value={`${fmt(vent.seated.ADPI_pct, 0)}%`}
                    sub={`CO₂ compliant: ${fmt(vent.seated.CO2_compliant_pct, 0)}%`}
                    ok={vent.seated.ADPI_pct >= 60}
                  />
                )}
              </div>
            )}

            {/* ── DataCenter KPI row ── */}
            {isDataCenter && hasDCMetrics && rci && rti && eff && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
