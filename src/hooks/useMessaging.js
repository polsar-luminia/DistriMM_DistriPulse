import { useTemplates } from "./messaging/useTemplates";
import { useMessageLog } from "./messaging/useMessageLog";
import { useMessageSending } from "./messaging/useMessageSending";
import { useLotes } from "./messaging/useLotes";

export function useMessaging({ markRemindersAsSent } = {}) {
  const templates = useTemplates();
  const log = useMessageLog();
  const sending = useMessageSending({ markRemindersAsSent });
  const lotes = useLotes();

  return {
    ...templates,
    ...log,
    ...sending,
    ...lotes,
  };
}
