import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LiveDecisionDetail } from "../screens/DecisionLive";
import { LiveIncidentScreen, LiveMapScreen } from "../screens/IncidentLive";
import { LiveAuditScreen } from "../screens/AuditLive";
import { LiveDirector } from "../screens/DirectorLive";
import { useDevice, useSignIn } from "../live/DeviceProvider";
import { login } from "../live/session";
import type { Role } from "../data/types";
import { MOMENTS, type MomentId } from "../data/demo";
import { CommandCenter } from "../screens/CommandCenter";
import {
  AuditScreen, CargoScreen, DecisionDetailScreen, DirectorScreen, FieldScreen, FreshnessStates, IncidentScreen,
  InventoryScreen, LoginScreen, MapScreen, PersonnelScreen, SyncScreen,
} from "../screens/Screens";

/**
 * Screen content is still the design's demo moments (fixtures standing in for evaluate()), picked
 * with `?moment=`; F2+ replace it with live state. The chrome (top bar, sidebar, offline banner,
 * comms strip) is live once this tab is signed in.
 */

function useMoment(fallback: MomentId): MomentId {
  const [params] = useSearchParams();
  const m = params.get("moment");
  return m && m in MOMENTS ? (m as MomentId) : fallback;
}

const flag = (params: URLSearchParams, key: string) => params.get(key) === "1";

function CommandRoute() {
  const [params] = useSearchParams();
  return (
    <CommandCenter
      key={params.toString()}
      moment={useMoment("slip")}
      cascade={flag(params, "cascade")}
      trace={flag(params, "trace")}
      whatIf={flag(params, "whatif")}
      stationsInEmergency={flag(params, "stations")}
    />
  );
}

const DECISION_MOMENTS = ["slip", "hq-2501600", "hq-2501620", "maitri-2501600"] as const;
type DecisionMoment = (typeof DECISION_MOMENTS)[number];

function DecisionRoute() {
  const device = useDevice();
  const { decisionId = "DEC-01" } = useParams();
  const moment = useMoment("hq-2501600");
  if (device) return <LiveDecisionDetail key={decisionId} id={decisionId} />;
  const m: DecisionMoment = (DECISION_MOMENTS as readonly string[]).includes(moment) ? (moment as DecisionMoment) : "hq-2501600";
  return <DecisionDetailScreen key={m} moment={m} />;
}

/** Cargo, Inventory and Personnel take a coarser state than the moment. */
function useOpsState() {
  const moment = useMoment("slip");
  return moment === "start" || moment === "hq-2501620" ? "start" : moment === "hq-2600900" ? "uncertain" : "slip";
}

function CargoRoute() {
  const state = useOpsState();
  return <CargoScreen key={state} state={state} />;
}

function InventoryRoute() {
  const [params] = useSearchParams();
  const s = useOpsState();
  const state = flag(params, "empty") ? "empty" : s === "uncertain" ? "start" : s;
  return <InventoryScreen key={state} state={state} role={params.get("role") === "HQ_OPS" ? "HQ_OPS" : "STATION_LEADER"} />;
}

function PersonnelRoute() {
  const [params] = useSearchParams();
  const s = useOpsState();
  const role = params.get("role");
  return <PersonnelScreen state={s === "uncertain" ? "start" : s} role={role === "HQ_OPS" || role === "FIELD_LEAD" ? role : "STATION_LEADER"} />;
}

function MapRoute() {
  const device = useDevice();
  const moment = useMoment("maitri-2501600");
  if (device) return <LiveMapScreen />;
  return <MapScreen key={moment} moment={moment} />;
}

function IncidentRoute() {
  const [params] = useSearchParams();
  if (useDevice()) return <LiveIncidentScreen />;
  return <IncidentScreen conflictOpen={flag(params, "conflict")} />;
}

function AuditRoute() {
  const [params] = useSearchParams();
  if (useDevice()) return <LiveAuditScreen />;
  return <AuditScreen key={params.toString()} emptyFilter={flag(params, "empty")} />;
}

function SyncRoute() {
  const [params] = useSearchParams();
  const link = params.get("link");
  return <SyncScreen key={params.toString()} link={link === "DEGRADED" || link === "ONLINE" ? link : "OFFLINE"} stalled={flag(params, "stalled")} />;
}

const ROLES: Role[] = ["HQ_OPS", "STATION_LEADER", "FIELD_LEAD"];

/** Real login against the server. `?error=1` shows the static wrong-PIN design state instead. */
function LoginRoute() {
  const [params] = useSearchParams();
  const signIn = useSignIn();
  const navigate = useNavigate();
  const role = params.get("role");
  if (flag(params, "error")) return <LoginScreen error />;
  return (
    <LoginScreen
      initialRole={ROLES.includes(role as Role) ? (role as Role) : "STATION_LEADER"}
      onSubmit={async (req) => {
        await signIn(await login(req));
        navigate(req.role === "FIELD_LEAD" ? "/field" : "/command");
      }}
    />
  );
}

function Home() {
  return <Navigate to={useDevice() ? "/command" : "/login"} replace />;
}

function FieldRoute() {
  const [params] = useSearchParams();
  return <FieldScreen offline={flag(params, "offline")} />;
}

/** Every screen and demo moment the design covers, for review. Dev only. */
const GALLERY: { group: string; links: [string, string][] }[] = [
  { group: "Command Center", links: [
    ["Start · all GREEN", "/command?moment=start"],
    ["After the slip", "/command?moment=slip"],
    ["Slip with cascade + trace", "/command?moment=slip&cascade=1&trace=1"],
    ["HQ 25 Jan 16:00 · before sync", "/command?moment=hq-2501600&trace=1"],
    ["HQ 25 Jan 16:10 · conflict flagged", "/command?moment=hq-2501610"],
    ["Maitri tablet 16:00 · offline, INC-01", "/command?moment=maitri-2501600"],
    ["Maitri tablet · station cards in emergency", "/command?moment=maitri-2501600&stations=1"],
    ["HQ 16:20 · approved", "/command?moment=hq-2501620"],
    ["What-if (burn +15 %)", "/command?moment=hq-2501620&whatif=1"],
    ["HQ 26 Jan 09:00 · C-104 UNCERTAIN", "/command?moment=hq-2600900"],
  ] },
  { group: "Decision Detail", links: [
    ["After the slip", "/decisions/DEC-01?moment=slip"],
    ["HQ 16:00 · straddle, verify gate", "/decisions/DEC-01?moment=hq-2501600"],
    ["HQ 16:20 · after sync", "/decisions/DEC-01?moment=hq-2501620"],
    ["Station Leader · approval not allowed", "/decisions/DEC-01?moment=maitri-2501600"],
  ] },
  { group: "Operations", links: [
    ["Cargo · start (edit ETA preview)", "/cargo?moment=start"],
    ["Cargo · after the slip", "/cargo?moment=slip"],
    ["Cargo · C-104 UNCERTAIN", "/cargo?moment=hq-2600900"],
    ["Inventory · start", "/inventory?moment=start"],
    ["Inventory · after the slip", "/inventory?moment=slip"],
    ["Inventory · HQ read-only", "/inventory?moment=slip&role=HQ_OPS"],
    ["Inventory · empty", "/inventory?empty=1"],
    ["Personnel and Missions", "/personnel?moment=slip"],
    ["Personnel · Field Lead", "/personnel?moment=slip&role=FIELD_LEAD"],
    ["Map", "/map?moment=maitri-2501600"],
  ] },
  { group: "Incident, sync, audit", links: [
    ["Incident INC-01", "/incident"],
    ["Incident · SK-2 conflict open", "/incident?conflict=1"],
    ["Sync drawer · offline", "/sync?link=OFFLINE"],
    ["Sync drawer · degraded drain", "/sync?link=DEGRADED"],
    ["Sync drawer · stalled item", "/sync?link=ONLINE&stalled=1"],
    ["Audit + Review queue", "/audit"],
    ["Audit · empty filter", "/audit?empty=1"],
  ] },
  { group: "Other", links: [
    ["Login", "/login"],
    ["Login · wrong PIN", "/login?error=1"],
    ["Field Lead (mobile)", "/field"],
    ["Field Lead · offline", "/field?offline=1"],
    ["Director panel", "/director"],
    ["Freshness and state chips", "/states"],
  ] },
];

function Gallery() {
  return (
    <div className="min-h-screen bg-bg p-8 text-fg">
      <h1 className="font-mono text-xl font-bold tracking-[0.2em]">DHRUV · screens</h1>
      <p className="mt-1 text-sm text-fg-2">Design import: every screen at each demo moment. Values are frozen fixtures until the engine and live sync are wired.</p>
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
        {GALLERY.map((g) => (
          <section key={g.group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-2">{g.group}</h2>
            <ul className="space-y-1">
              {g.links.map(([label, to]) => (
                <li key={to}><Link to={to} className="text-sm text-accent hover:underline">{label}</Link></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [params] = useSearchParams();
  const device = useDevice();
  // Hidden Director (?director=1): live when this tab is signed in, the design mock otherwise.
  if (flag(params, "director")) return device ? <LiveDirector /> : <DirectorScreen />;
  return (
    <div className="h-screen w-full">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/screens" element={<Gallery />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/command" element={<CommandRoute />} />
        <Route path="/decisions" element={<Navigate to="/decisions/DEC-01" replace />} />
        <Route path="/decisions/:decisionId" element={<DecisionRoute />} />
        <Route path="/cargo" element={<CargoRoute />} />
        <Route path="/inventory" element={<InventoryRoute />} />
        <Route path="/personnel" element={<PersonnelRoute />} />
        <Route path="/map" element={<MapRoute />} />
        <Route path="/incident" element={<IncidentRoute />} />
        <Route path="/audit" element={<AuditRoute />} />
        <Route path="/sync" element={<SyncRoute />} />
        <Route path="/what-if" element={<Navigate to="/command?moment=hq-2501620&whatif=1" replace />} />
        <Route path="/field" element={<FieldRoute />} />
        <Route path="/director" element={device ? <LiveDirector /> : <DirectorScreen />} />
        <Route path="/states" element={<FreshnessStates />} />
        <Route path="*" element={<Navigate to="/command" replace />} />
      </Routes>
    </div>
  );
}
