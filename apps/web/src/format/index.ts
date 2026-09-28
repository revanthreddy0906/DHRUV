/**
 * Every display format in the web app goes through here (docs/ui-redesign/CLAUDE.md section 6).
 * This is the only place components' numbers are shaped; it never computes readiness.
 */
export { UNKNOWN, decimalsFor, formatQty } from "./number";
export { formatRatio } from "./ratio";
export { formatHaveNeed, formatMargin } from "./margin";
export { ALL_CLEAR, DIMENSION_LABEL, dimensionHeadline, dimensionReason, drivingDimension, drivingItem, isAllClear, stationReason, statusLine } from "./status";
export { RULE_TITLE, TRACE_GROUPS, b0Line, groupTrace, traceGroup, traceSentence, type EngineStep, type TraceGroup } from "./trace";
export { consequenceLine, countPlausibility, type ConsequenceInput } from "./consequence";
export { timelinePositions } from "./timeline";
export { formatAge, formatAgeMinutes, formatAgo, formatDate, formatDateTime, formatSimClock, formatTime, formatWallTime } from "./time";
export { GRAPH_COLUMNS, TYPE_COLUMN, defaultFocus, downstreamOf, focusView, isAbnormal, linkToPath, upstreamOf, type Collapsed, type FocusEdge, type FocusRole, type FocusView } from "./graphFocus";
export { TYPE_LABEL, numberRuns, readableDates, recordAction, recordDetail, recordReason, sourceNote } from "./graphText";
