/**
 * Incident ids written by a field device: the existing "INC-" prefix and a two-digit number, with
 * the team in between (INC-FT3-01) so two devices raising incidents offline can never pick the
 * same id. The server keeps the first INCIDENT_OPENED per id, so a clash would lose one silently.
 */
export function nextIncidentId(team: string, knownIds: Iterable<string>): string {
  const prefix = `INC-${team.replace(/[^A-Za-z0-9]/g, "")}-`;
  let max = 0;
  for (const id of knownIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
