import { useSyncExternalStore } from "react";
import { sessionStore } from "../storage/session";
import { useSync } from "../sync/controller";
export function useSession() {
  const local = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
  );
  const sync = useSync();
  return sync.role === "guest"
    ? {
        current: sync.current,
        ready: local.ready && sync.ready,
        busy: sync.busy,
        failure: sync.error,
        recoveryPending: false,
      }
    : { ...local, ready: local.ready && sync.ready };
}
