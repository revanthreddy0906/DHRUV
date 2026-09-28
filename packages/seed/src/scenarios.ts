import type { Seed } from "@dhruv/shared";
import { AURORA_BEATS, aurora2016Seed } from "./aurora2016.js";
import { MARION_BEATS, marion2026Seed } from "./marion2026.js";
import { DIRECTOR_BEATS, type DirectorBeat } from "./director.js";
import { season48 } from "./season48.js";

/** A Director scenario: the seed it starts from and its script. */
export interface Scenario {
  id: string;
  title: string;
  /** One line shown in the Director: what it is, and for a real incident, that it is an adaptation. */
  blurb: string;
  seed: Seed;
  beats: DirectorBeat[];
  /** Absolute clock jumps offered in the Director. */
  clockJumps: { label: string; iso: string }[];
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "season48",
    title: "Season 48: fuel slip and overdue team",
    blurb: "The Build Bible's synthetic scenario (section 13). Golden numbers are checked against it.",
    seed: season48,
    beats: DIRECTOR_BEATS,
    clockJumps: [
      { label: "24 Jan 08:00", iso: "2027-01-24T08:00:00.000Z" },
      { label: "25 Jan 16:00", iso: "2027-01-25T16:00:00.000Z" },
      { label: "26 Jan 09:00", iso: "2027-01-26T09:00:00.000Z" },
    ],
  },
  {
    id: "aurora2016",
    title: "Real incident: Aurora Australis aground at Mawson, 2016",
    blurb: "Adapted: Mawson → Maitri, Aurora Australis → MV Ice Star, dates moved to 2027, cargo quantities illustrative. Sources on each beat.",
    seed: aurora2016Seed,
    beats: AURORA_BEATS,
    clockJumps: [
      { label: "20 Feb", iso: "2027-02-20T06:00:00.000Z" },
      { label: "24 Feb 09:15", iso: "2027-02-24T09:15:00.000Z" },
      { label: "2 Mar", iso: "2027-03-02T12:00:00.000Z" },
      { label: "12 Mar", iso: "2027-03-12T08:00:00.000Z" },
    ],
  },
  {
    id: "marion2026",
    title: "Real incident: Marion Island polar diesel crisis, 2026",
    blurb: "Adapted from the 2026 Marion Island relief delay: Marion → Maitri, SA Agulhas II → MV Ice Star, dates moved to 2027. Station, vessel and all quantities are illustrative. Sources on each beat.",
    seed: marion2026Seed,
    beats: MARION_BEATS,
    clockJumps: [
      { label: "1 Apr", iso: "2027-04-01T08:00:00.000Z" },
      { label: "8 May 06:00", iso: "2027-05-08T06:00:00.000Z" },
      { label: "9 May", iso: "2027-05-09T10:00:00.000Z" },
      { label: "14 May", iso: "2027-05-14T09:00:00.000Z" },
      { label: "18 May", iso: "2027-05-18T06:30:00.000Z" },
      { label: "27 May", iso: "2027-05-27T16:00:00.000Z" },
    ],
  },
];

export const DEFAULT_SCENARIO = "season48";

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Looks a beat up in a scenario's script (season48 unless named). */
export function findBeat(beat: string, scenario: string = DEFAULT_SCENARIO): DirectorBeat | undefined {
  return scenarioById(scenario)?.beats.find((b) => b.beat === beat);
}
