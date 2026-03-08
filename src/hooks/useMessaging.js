/**
 * @fileoverview Barrel hook that composes all messaging sub-hooks.
 * Pages consume this single hook — the public API is unchanged.
 * @module hooks/useMessaging
 */

import { useTemplates } from "./messaging/useTemplates";
import { useMessageLog } from "./messaging/useMessageLog";
import { useMessageSending } from "./messaging/useMessageSending";
import { useLotes } from "./messaging/useLotes";

/**
 * Main messaging hook. Composes sub-hooks for templates, log, sending, and lotes.
 * @param {object} [options]
 * @param {Function} [options.markRemindersAsSent] - Callback to mark invoices as reminded
 * @returns {object} Merged state and actions from all messaging sub-hooks
 */
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
