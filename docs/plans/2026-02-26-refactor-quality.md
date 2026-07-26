# Quality Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two bugs, extract constants, safe-refactor DashboardContext, extract ETL logic from UploadModal, and add JSDoc to portfolioService.

**Architecture:** Incremental changes validated with `pnpm build` after each task. No new dependencies. No route changes. No breaking changes to context consumers.

**Tech Stack:** React 19, Vite 7, Supabase JS client, date-fns, sileo for toasts.

---

## Task 1: Bug Fix — Sending Hours

**Files:**
- Modify: `src/services/messagingService.js:33`

The comment says "7am–9pm" but the guard `hour >= 23` allows sends until 11pm.

**Step 1: Fix the condition**

In `src/services/messagingService.js`, change line 33:
```js
// Before
if (hour >= 23 || hour < 7) {

// After
if (hour >= 21 || hour < 7) {
```

Also update the reason string on the next line to say `9pm` instead of whatever it currently says (match the condition).

**Step 2: Build**
```bash
pnpm build
```
Expected: build succeeds, 0 errors.

**Step 3: Commit**
```bash
git add src/services/messagingService.js
git commit -m "fix: correct sending hours guard to block after 9pm (was 11pm)"
```

---

## Task 2: Extract Magic Constants

**Files:**
- Create: `src/constants.js`
- Modify: `src/services/messagingService.js`
- Modify: `src/components/UploadModal.jsx`

**Step 1: Create `src/constants.js`**

```js
/**
 * @fileoverview App-wide constants. Import from here instead of hardcoding.
 */

/** UTC offset for Colombia (America/Bogota, no DST) */
export const COLOMBIA_OFFSET = -5;

/** Maximum messages per day enforced server-side and client-side */
export const DAILY_LIMIT = 80;

/** Supabase upsert batch size for cartera_items inserts */
export const CARTERA_BATCH_SIZE = 100;

/** Supabase upsert batch size for distrimm_clientes upserts */
export const CLIENTES_BATCH_SIZE = 50;
```

**Step 2: Update `src/services/messagingService.js`**

Remove the two local declarations at the top of the file:
```js
// DELETE these lines:
const COLOMBIA_OFFSET = -5;
// ...
const DAILY_LIMIT = 80;
```

Add import at the top (after existing imports):
```js
import { COLOMBIA_OFFSET, DAILY_LIMIT } from "../constants";
```

**Step 3: Update `src/components/UploadModal.jsx`**

Add import after existing imports:
```js
import { CARTERA_BATCH_SIZE, CLIENTES_BATCH_SIZE } from "../constants";
```

Replace the two inline `const batchSize = ...` declarations:
- Line ~374: `const batchSize = 100;` → `const batchSize = CARTERA_BATCH_SIZE;`
- Line ~444: `const batchSize = 50;` → `const batchSize = CLIENTES_BATCH_SIZE;`

**Step 4: Build**
```bash
pnpm build
```
Expected: 0 errors.

**Step 5: Commit**
```bash
git add src/constants.js src/services/messagingService.js src/components/UploadModal.jsx
git commit -m "refactor: extract magic constants to src/constants.js"
```

---

## Task 3: Bug Fix — Destructive Rollback in UploadModal

**Files:**
- Modify: `src/components/UploadModal.jsx` — `handleConfirmUploadClientes` function (~line 437)

**The bug:** On failure, the rollback DELETEs all NITs that were processed in this batch — including clients that already existed before the upload. A second upload that partially fails will destroy pre-existing client data.

**Step 1: Pre-fetch existing NITs before the upsert loop**

At the start of `handleConfirmUploadClientes`, before the `for` loop, add:

```js
// Fetch NITs that already exist before this upload (to protect during rollback)
const allNitsInUpload = fullData.map((item) => item.no_identif);
const { data: existingRows } = await supabase
  .from("distrimm_clientes")
  .select("no_identif")
  .in("no_identif", allNitsInUpload);
const preExistingNits = new Set((existingRows || []).map((r) => r.no_identif));
```

**Step 2: Update rollback to only delete truly new records**

In the `catch` block, change the rollback condition:
```js
// Before:
if (processedNits.length > 0) {

// After:
const newNitsToRollback = processedNits.filter((nit) => !preExistingNits.has(nit));
if (newNitsToRollback.length > 0) {
```

And inside the rollback loop, change `processedNits` to `newNitsToRollback`:
```js
// Before:
for (let i = 0; i < processedNits.length; i += 100) {
  const nitBatch = processedNits.slice(i, i + 100);

// After:
for (let i = 0; i < newNitsToRollback.length; i += 100) {
  const nitBatch = newNitsToRollback.slice(i, i + 100);
```

**Step 3: Build**
```bash
pnpm build
```

**Step 4: Commit**
```bash
git add src/components/UploadModal.jsx
git commit -m "fix: rollback only truly new clients on upload failure, protect pre-existing records"
```

---

## Task 4: Simplify DashboardContext — Remove Duplicates

**Files:**
- Modify: `src/components/DashboardManager.jsx`
- Modify: `src/pages/MessagesPage.jsx`

**The duplicates (lines 129–186 of DashboardManager.jsx):**
- `availableLoads` is top-level **and** inside `data` (line 169)
- `currentLoadId` is top-level **and** inside `data` (line 170)
- `stats` raw object is inside `data.stats` (line 164) — already projected into `data.kpi` and `data.advanced`
- `charts` raw object is inside `data.charts` (line 165) — already spread directly into `data` via `...charts`

**Step 1: Update `dashboardContextValue.data` in DashboardManager.jsx**

Remove these 4 lines from inside the `data: { ... }` object:
```js
// DELETE from data:
stats,          // line 164 — consumers use data.kpi / data.advanced
charts,         // line 165 — consumers use data.aging, data.projection, etc. (spread)
availableLoads, // line 169 — duplicate of top-level availableLoads
currentLoadId,  // line 170 — duplicate of top-level currentLoadId
```

The `data` object after cleanup should end with:
```js
data: {
  items: sortedItems,
  allItems: items,
  kpi: { ... },
  advanced: { ... },
  ...charts,        // keeps data.aging, data.projection, data.radarData etc.
  lists,
  aggregatedClients: lists.aggregatedClients,
  healthScore,
  upcomingItems: lists.upcomingItems,
  vendedores,
},
```

**Step 2: Update MessagesPage.jsx**

`src/pages/MessagesPage.jsx` line 20 reads `data.currentLoadId`. Fix it to use the top-level property:

```js
// Before (line 20):
const currentLoadId = data.currentLoadId || null;

// After:
const currentLoadId = context.currentLoadId || null;
```

Check how `context` and `data` are destructured at the top of MessagesPage (line 18–19) and make sure `context` is available there. If the page only destructures `data` from `useOutletContext()`, add `currentLoadId` to the destructuring:
```js
const { data, currentLoadId, ... } = useOutletContext();
```

**Step 3: Build and verify no other page uses `data.currentLoadId` or `data.availableLoads`**
```bash
pnpm build
# Also verify no other consumer broke:
grep -rn "data\.currentLoadId\|data\.availableLoads\|data\.stats\b\|data\.charts\b" src/pages/
```
Expected: `pnpm build` succeeds, grep returns 0 matches.

**Step 4: Commit**
```bash
git add src/components/DashboardManager.jsx src/pages/MessagesPage.jsx
git commit -m "refactor: remove duplicate availableLoads/currentLoadId/stats/charts from data context"
```

---

## Task 5: Extract ETL Logic from UploadModal

**Files:**
- Create: `src/utils/excelETL.js`
- Modify: `src/components/UploadModal.jsx`

UploadModal.jsx is 908 lines. Lines 24–174 are pure ETL (no React, no Supabase) and can be extracted.

**Step 1: Create `src/utils/excelETL.js`**

Move these items verbatim from UploadModal.jsx into a new file:
- `parseFlexibleDate` function (lines ~25–60)
- `UPLOAD_TYPES` constant (lines ~62–66)
- `detectFileType` function (lines ~67–84)
- `processCarteraData` function (lines ~85–126)
- `processClientesData` function (lines ~127–175)

The new file should export all of them:

```js
/**
 * @fileoverview Excel ETL utilities — parsing, type detection, and row normalization.
 * Pure functions with no React or Supabase dependencies.
 */
import { parse, isValid } from "date-fns";
import { es } from "date-fns/locale";

export const UPLOAD_TYPES = {
  CARTERA: "cartera",
  CLIENTES: "clientes",
};

export const parseFlexibleDate = (rawDate) => {
  // ... full function body (copy verbatim from UploadModal lines 25-61)
};

export const detectFileType = (headers) => {
  // ... full function body (copy verbatim from UploadModal lines 67-84)
};

export const processCarteraData = (jsonData) => {
  // ... full function body (copy verbatim from UploadModal lines 85-126)
};

export const processClientesData = (jsonData) => {
  // ... full function body (copy verbatim from UploadModal lines 127-175)
};
```

**Step 2: Update UploadModal.jsx**

1. Delete lines 24–175 (the ETL functions and UPLOAD_TYPES constant).
2. Remove the `date-fns` imports (`parse`, `isValid`, `es`) — they are now only needed in excelETL.js.
3. Add import at the top:
```js
import {
  UPLOAD_TYPES,
  parseFlexibleDate,
  detectFileType,
  processCarteraData,
  processClientesData,
} from "../utils/excelETL";
```

**Step 3: Build**
```bash
pnpm build
```
Expected: 0 errors. UploadModal should now be ~730 lines.

**Step 4: Commit**
```bash
git add src/utils/excelETL.js src/components/UploadModal.jsx
git commit -m "refactor: extract Excel ETL logic to src/utils/excelETL.js"
```

---

## Task 6: JSDoc @returns on portfolioService.js

**Files:**
- Modify: `src/services/portfolioService.js`

**Step 1: Add `@returns` to every exported function**

The file has inconsistent return signatures. Add JSDoc `@returns` tags (do NOT change any function signatures — only add documentation):

```js
/**
 * Fetches all available loads...
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getLoads = ...

/**
 * Deletes a load...
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const deleteLoad = ...

/**
 * Fetches all portfolio items for a specific load.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getPortfolioItems = ...

/**
 * Fetches only valor_saldo column for a load.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getPortfolioSummary = ...

/**
 * Marks multiple invoices as having a reminder sent.
 * @returns {Promise<{success: boolean, timestamp: string|null, error: Error|null}>}
 */
export const markRemindersAsSent = ...

/**
 * Tests the Supabase connection.
 * @returns {Promise<{connected: boolean, error: Error|null}>}
 */
export const testConnection = ...

/**
 * Rolls back a failed upload by deleting the load record.
 * @returns {Promise<void>}
 */
export const rollbackUpload = ...
```

Continue this pattern for ALL remaining exported functions in the file. Read the function bodies to determine the actual return shape.

**Step 2: Build**
```bash
pnpm build
```

**Step 3: Commit**
```bash
git add src/services/portfolioService.js
git commit -m "docs: add @returns JSDoc to all portfolioService exported functions"
```

---

## Final Verification

```bash
pnpm build
grep -rn "data\.currentLoadId\|data\.availableLoads" src/pages/
grep -rn "from 'sonner'\|from \"sonner\"" src/
grep -rn "DAILY_LIMIT\|COLOMBIA_OFFSET" src/services/messagingService.js
```

Expected:
- Build: ✅ success
- `data.currentLoadId` / `data.availableLoads`: 0 matches
- `sonner` imports: 0 matches
- Constants in messagingService: 0 matches (moved to constants.js)
