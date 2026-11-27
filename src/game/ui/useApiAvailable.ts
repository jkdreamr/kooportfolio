import { useEffect, useState } from "react";
import { apiStatus, type ApiStatus } from "../../shared/api";

/** null while the once-per-session probe runs, then the shared backend's
 * status. Features fall back to this device unless it says live. */
export function useApiStatus(): ApiStatus | null {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void apiStatus().then((value) => {
      if (alive) setStatus(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/** null while probing, then whether the shared backend is live. */
export function useApiAvailable(): boolean | null {
  const status = useApiStatus();
  return status ? status.live : null;
}
