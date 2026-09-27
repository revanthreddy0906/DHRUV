import { useSearchParams } from "react-router-dom";
import { STATION_NODES } from "@dhruv/seed";

/**
 * The station HQ Ops is looking at, shared by the top bar and every screen: `?station=` in the URL
 * (undefined = all stations). Station roles are fixed to the node in their token, so for them this
 * is ignored by useLiveOps. Presentation only; the server checks node on every event.
 */
export function useStationFocus(): [string | undefined, (node: string | undefined) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("station") ?? undefined;
  const focus = raw && (STATION_NODES as readonly string[]).includes(raw) ? raw : undefined;
  const setFocus = (node: string | undefined) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (node) next.set("station", node);
      else next.delete("station");
      return next;
    }, { replace: true });
  return [focus, setFocus];
}
