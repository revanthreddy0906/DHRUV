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
export { formatAge, formatAgeMinutes, formatAgo, formatDate, formatDateTime, formatSimClock, formatTime, formatWallDateTime, formatWallTime } from "./time";
export { GRAPH_COLUMNS, TYPE_COLUMN, defaultFocus, downstreamOf, focusView, isAbnormal, linkToPath, upstreamOf, type Collapsed, type FocusEdge, type FocusRole, type FocusView } from "./graphFocus";
export { TYPE_LABEL, numberRuns, readableDates, recordAction, recordDetail, recordLabel, recordReason, sourceNote } from "./graphText";
export { checkInStatus, fieldLinkLine, formatDateRange, type CheckInState, type CheckInStatus } from "./checkin";
export {
  assetHistory, entryPlace, entryPlaceText, formatCoords, maintainedBy, needsVarianceReason, personHistory, roleWords, stockDerivation, stockLedger, variance, varianceReview,
  type ReviewRow,
  type DeviceOutboxView, type EntryPlace, type HistoryRow, type LedgerRow, type StockItemRef, type Variance,
} from "./ledger";
export {
  actorLabel, appliedLeversSentence, compareRows, consequenceChain, costText, daysText, daysUntil, deadlineHeadline, decisionPhase, expectedResultText, expiredText, followUpSentence,
  lastActDate, leverAxis, leverEffect, leverName, markerAlign, optionName, parseVerify, rankingReason, slackText, triggerPhrase, verifyInputs, verifySentence,
  type Cell, type CellTone, type CompareRow, type DeadlineHeadline, type DecisionPhase, type LeverAxis, type OptionFacts, type RankCategory, type VerifyInput,
} from "./decision";
