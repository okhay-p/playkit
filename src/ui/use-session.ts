import { useSyncExternalStore } from "react";
import { sessionStore } from "../storage/session";
export const useSession = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
