# Gamma Budget of Uncertainty Robustness Layer

The **Gamma Budget Robustness Layer** provides deterministic worst-case sensitivity analysis for polar logistics planning on top of the deterministic decision engine (Rules R01, R02, and R03).

---

## 1. What Gamma Robustness Means in This Project

In mission-critical polar logistics, planners face multiple concurrent operational uncertainties:
- **Burn rate variations**: Cold snaps or heavy machinery loads increasing fuel/power consumption.
- **Stock discrepancies**: Physical counting errors or unrecorded usage.
- **Shipment transit delays**: Weather-delayed feeder vessels missing ship cutoff dates.

Assuming *all* parameters simultaneously deviate to their worst possible extreme is overly conservative and leads to unnecessary mission cancellations. Conversely, assuming *no* deviations leads to vulnerability.

The **Gamma ($\Gamma$) budget model** (Bertsimas & Simchi-Levi / Bertsimas & Sim) parameterizes the decision maker's conservatism:
- An integer budget $\Gamma \in [0, n]$ represents the maximum number of uncertain parameters allowed to simultaneously deviate to their worst-case values.
- $\Gamma = 0$: Nominal deterministic calculation (baseline).
- $\Gamma = 1$: Single worst-case deviation among all candidates.
- $\Gamma = 2$: Worst-case pair of concurrent deviations.
- $\Gamma = n$: Worst-case scenario across all potential deviations.

---

## 2. Core Architecture & Determinism

### Reusing the Deterministic Engine
The robustness layer is **strictly non-invasive and deterministic**:
1. It does **not** duplicate or replace Rules R01, R02, or R03.
2. For each combination of size $\Gamma$, it perturbs the input state on a cloned copy and executes the **exact** existing engine (`computeRequirement`, `checkFeasibility`, `computeAvailability`).
3. It determines the minimum availability ratio across all evaluated combinations.

### Why No Machine Learning (ML)?
- Mission-critical polar resupply requires 100% explainable, reproducible, and verifiable decisions.
- Black-box heuristics or stochastic weights cannot guarantee safety constraints or pass regulatory audits.

### Why No Monte Carlo Simulations?
- Monte Carlo simulations introduce non-deterministic sampling variance and random seeds.
- Discrete $\Gamma$-budget optimization evaluates exact $C(n, k)$ deterministic scenarios with mathematical guarantees and exact tie-breaking.

---

## 3. Supported Uncertainty Targets

| Target | Description | Adverse Direction | Affected Rules |
| :--- | :--- | :--- | :--- |
| `burnRate` | Daily consumption uplift | `increase` | **R01** (`computeRequirement`) |
| `stockCount` | On-hand inventory discrepancy | `decrease` | **R03** (`computeAvailability`) |
| `shipmentSlack` | Feeder leg ETA delay towards cutoff | `decrease` | **R02** (`checkFeasibility`) & **R03** |

Deviations can be expressed in `percent` or `absolute` units.

---

## 4. Combinations & Tie-Breaking

- For $n$ uncertainties and budget $\Gamma = k$, the layer evaluates all $C(n, k) = \frac{n!}{k!(n-k)!}$ combinations.
- If two distinct combinations produce identical worst-case availability ratios, tie-breaking is resolved deterministically by comparing the lexicographical `bindingKey` (sorted comma-separated input names).

---

## 5. Example Invocation

```typescript
import {
  evaluateWithBudget,
  evaluateBudgetCurve,
  type RobustnessBaseInputs,
  type UncertainInput,
} from "@dhruv/engine";

const baseInputs: RobustnessBaseInputs = {
  item: {
    itemId: "INV-DSL",
    nodeId: "MAITRI",
    stock: 92.0,
    unit: "kL",
    reservePct: 0.10,
    dimension: "FUEL",
    lastObservedAt: "2027-01-24T04:00:00.000Z",
  },
  consumptionProfiles: [
    { item_id: "INV-DSL", phase: "CLOSING", rate_per_day: 0.55 },
    { item_id: "INV-DSL", phase: "WINTER", rate_per_day: 0.38 },
    { item_id: "INV-DSL", phase: "MOBILISATION", rate_per_day: 0.35 },
  ],
  now: "2027-01-24T08:00:00.000Z",
  phaseBoundaries: {
    CLOSING: { start: "2027-01-24T00:00:00.000Z", end: "2027-02-28T00:00:00.000Z" },
    WINTER: { start: "2027-03-01T00:00:00.000Z", end: "2027-10-31T00:00:00.000Z" },
    MOBILISATION: { start: "2027-11-01T00:00:00.000Z", end: "2027-11-20T00:00:00.000Z" },
  },
  inboundLeg: {
    legId: "L2-C104",
    shipmentId: "C-104",
    status: "IN_TRANSIT",
    eta: "2027-02-02T00:00:00.000Z",
    etd: "2027-01-12T00:00:00.000Z",
    vesselId: null,
  },
  vessel: {
    vesselId: "V-ICE-STAR",
    departure: "2027-02-06T00:00:00.000Z",
    loadCutoff: "2027-02-04T00:00:00.000Z",
    etaStation: "2027-02-24T00:00:00.000Z",
    stationClosingDate: "2027-02-28T00:00:00.000Z",
  },
  inboundCargoQty: 48.0,
};

const uncertainties: UncertainInput[] = [
  {
    name: "cold_snap_burn_rate",
    target: "burnRate",
    nominal: 0,
    deviation: 15,
    unit: "percent",
    adverseDirection: "increase",
  },
  {
    name: "tank_measurement_error",
    target: "stockCount",
    nominal: 92.0,
    deviation: 10,
    unit: "percent",
    adverseDirection: "decrease",
  },
  {
    name: "feeder_weather_delay",
    target: "shipmentSlack",
    nominal: 2,
    deviation: 3,
    unit: "absolute",
    adverseDirection: "decrease",
  },
];

// Evaluate Gamma = 1 (worst single uncertainty)
const resGamma1 = evaluateWithBudget(baseInputs, uncertainties, 1);
console.log(resGamma1.ratio, resGamma1.state, resGamma1.bindingInputs);

// Evaluate the full Gamma curve (Gamma = 0 to Gamma = 3)
const curve = evaluateBudgetCurve(baseInputs, uncertainties);
```

---

## 6. Example Gamma Robustness Curve

| $\Gamma$ | Active Adverse Deviations | Worst Ratio | State | Binding Inputs |
| :---: | :--- | :---: | :---: | :--- |
| **0** | None (Nominal baseline) | `1.0606` | **GREEN** | `[]` |
| **1** | Feeder delay (+3 d $\rightarrow$ misses cutoff) | `0.6970` | **RED** | `["feeder_weather_delay"]` |
| **2** | Feeder delay + 15% burn uplift | `0.6061` | **RED** | `["cold_snap_burn_rate", "feeder_weather_delay"]` |
| **3** | All 3 uncertainties active | `0.5455` | **RED** | `["cold_snap_burn_rate", "feeder_weather_delay", "tank_measurement_error"]` |
