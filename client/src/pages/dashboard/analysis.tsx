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
} from "lucide-react";
import { useLocation } from "wouter";
import VTKViewer from "@/components/visualization/VTKViewer";
import type { Simulation } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────
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

// ── Report definitions ─────────────────────────────────────────────────────
const REPORTS = [
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
] as const;

// ── Small helpers ──────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, ok }: { label: string; value: string; sub?: string; ok?: boolean }) {
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

function fmt(v: number, decimals = 1) { return v.toFixed(decimals); }

// ── Main page ──────────────────────────────────────────────────────────────
export default function Analysis() {
  const [, params] = useRoute("/dashboard/analysis/:id");
  const [, setLocation] = useLocation();
  const simulationId = params?.id ? parseInt(params.id, 10) : null;

  const [openReport, setOpenReport] = useState<(typeof REPORTS)[number] | null>(null);

  const { data: simulation, isLoading, error } = useQuery<Simulation>({
    queryKey: [`/api/simulations/${simulationId}`],
    enabled: simulationId !== null && !isNaN(simulationId!),
  });

  const postUrl = (file: string) => `/api/simulations/${simulationId}/post/${file}`;
  const hasPost = !!simulationId && !isNaN(simulationId);

  const { data: comfort } = useQuery<ComfortMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/comfort_metrics.json`],
    enabled: hasPost,
    queryFn: () => fetch(postUrl("comfort_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: flow } = useQuery<FlowMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/flow_metrics.json`],
    enabled: hasPost,
    queryFn: () => fetch(postUrl("flow_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: vent } = useQuery<VentMetrics>({
    queryKey: [`/api/simulations/${simulationId}/post/ventilation_metrics.json`],
    enabled: hasPost,
    queryFn: () => fetch(postUrl("ventilation_metrics.json")).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const hasMetrics = !!(comfort || flow || vent);

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

            {/* KPI summary row */}
            {hasMetrics && (
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

            {/* Report cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REPORTS.map((report) => {
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
        <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              {openReport && (() => { const Icon = openReport.icon; return <Icon className={`h-5 w-5 ${openReport.color}`} />; })()}
              {openReport?.name}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0">
            {openReport && simulationId && (
              <iframe
                key={openReport.id}
                src={postUrl(openReport.file)}
                title={openReport.name}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
