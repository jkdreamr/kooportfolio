import { useEffect, useState } from "react";
import { apiAvailable } from "../../shared/api";

/** null while the one-per-session probe runs, then whether the shared
 * backend exists. Features that need it stay hidden until it says yes. */
export function useApiAvailable(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void apiAvailable().then((value) => {
      if (alive) setOnline(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return online;
}
