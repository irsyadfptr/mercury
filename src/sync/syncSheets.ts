// One sync pass for everything in the Sheet:
// 1. find the one spreadsheet every device shares and make sure its tabs exist,
// 2. append the cashflow offline queue,
// 3. read all tabs once,
// 4. cashflow: take the Sheet's entries and rewrite the Summary tab; portfolio: push, pull or merge by portfolioSyncAction.
import { useCashflow } from '@/cashflowStore'
import { ACCOUNT_COLUMNS, accountsFromSheet, mergeAccounts } from '@/domain/accounts'
import { BILL_COLUMNS, billsFromSheet } from '@/domain/bills'
import { entryToRow, missingFromRows, rowsToEntries } from '@/domain/cashflow'
import { GOAL_COLUMNS, goalsFromSheet } from '@/domain/cashGame'
import { summaryRows } from '@/domain/summarySheet'
import { DIVIDEND_COLUMNS, HOLDING_COLUMNS, JOURNAL_COLUMNS, mergeNewest, mergePortfolios, portfolioFromSheet, portfolioSyncAction, toRow, TRANSACTION_COLUMNS } from '@/domain/portfolioSheet'
import { useStore } from '@/store'
import type { ColumnSpec, ParsedTable, PortfolioData } from '@/types'
import type { TabName } from './sheets'
import { appendRows, createSpreadsheet, deleteRows, writeWholeTab, ensureTabs, findSpreadsheets, metaFromRows, readTabs, replaceTabs, TABS, writeCells } from './sheets'

export const SHEET_TITLE = 'Mercury Cashflow'
const PORTFOLIO_UPDATED_AT = 'portfolioUpdatedAt'

let running: Promise<void> | undefined
/** Last Summary written in this session (sheet id + rows), so an unchanged summary costs no requests. */
let lastSummary = ''

/** Runs one sync with the given token. Concurrent calls share the running pass instead of double-appending. */
export function syncSheets(token: string): Promise<void> {
  running ??= run(token).finally(() => {
    running = undefined
  })
  return running
}

/**
 * The sheet every device with this Google account shares: the oldest "Mercury Cashflow" this app made in their Drive
 * (Drive search skips trashed ones), else a new one. The device's remembered id is not reused on its own: it may point
 * at a trashed or renamed sheet that other devices can't find, which would split the devices again.
 */
async function spreadsheet(token: string): Promise<string> {
  const [oldest] = await findSpreadsheets(token, SHEET_TITLE)
  if (!oldest) return createSpreadsheet(token, SHEET_TITLE)
  await ensureTabs(token, oldest)
  return oldest
}

async function run(token: string): Promise<void> {
  // Edits made while this pass runs are newer than startedAt, so they stay "unsynced" for the next pass.
  const startedAt = new Date().toISOString()
  const { spreadsheetId: linked, pending, synced: localSynced, accounts: localAccounts, bills: localBills, goals: localGoals, deleted, edited } = useCashflow.getState()
  const spreadsheetId = await spreadsheet(token)

  // Moving to another device's sheet (each device used to make its own): bring this device's entries along,
  // and merge the portfolio as on a first sync. The old sheet stays in Drive untouched.
  const switched = linked !== undefined && linked !== spreadsheetId
  if (switched) useStore.setState({ syncedAt: undefined })
  const toSend = [...pending, ...(switched ? localSynced : [])]
  // Append only ids the Sheet doesn't have yet: a pass that failed after appending, or a restored backup, would duplicate rows.
  const fresh = toSend.length ? missingFromRows(toSend, (await readTabs(token, spreadsheetId, [TABS.entries])).Entries) : []
  await appendRows(token, spreadsheetId, TABS.entries, fresh.map(entryToRow))
  const tabs = await readTabs(token, spreadsheetId, [TABS.entries, TABS.holdings, TABS.transactions, TABS.dividends, TABS.journal, TABS.accounts, TABS.bills, TABS.goals, TABS.meta])

  // Rows typed by hand without id / createdAt get them now, written back so the id stays put. Data rows start at sheet row 2.
  const cash = rowsToEntries(tabs.Entries, { newId: () => crypto.randomUUID(), now: startedAt })
  await writeCells(
    token,
    spreadsheetId,
    cash.filled.flatMap((f) => [
      { range: `${TABS.entries}!A${f.row + 2}`, values: [[f.id]] },
      { range: `${TABS.entries}!G${f.row + 2}`, values: [[f.createdAt]] },
    ]),
  )
  // Entries edited in the app: rewrite their rows in place, found by id (an id no longer in the Sheet is dropped).
  const rowOf = new Map(tabs.Entries.map((r, i) => [String(r[0] ?? '').trim(), i]))
  const written = edited.filter((e) => rowOf.has(e.id))
  await writeCells(token, spreadsheetId, written.map((e) => ({ range: `${TABS.entries}!A${rowOf.get(e.id)! + 2}`, values: [entryToRow(e)] })))
  const editedById = new Map(written.map((e) => [e.id, e]))
  // Entries deleted in the app: remove their rows (0-based sheet index = data index + 1 for the header).
  const gone = new Set(deleted)
  await deleteRows(token, spreadsheetId, TABS.entries, tabs.Entries.flatMap((r, i) => (gone.has(String(r[0] ?? '').trim()) ? [i + 1] : [])))
  const remoteAccounts = accountsFromSheet(tabs.Accounts)
  const accounts = await syncTable(token, spreadsheetId, TABS.accounts, ACCOUNT_COLUMNS, remoteAccounts, (remote) => mergeAccounts(localAccounts, remote), mergeAccounts([], remoteAccounts.items))
  const remoteBills = billsFromSheet(tabs.Bills)
  const bills = await syncTable(token, spreadsheetId, TABS.bills, BILL_COLUMNS, remoteBills, (remote) => mergeNewest(localBills, remote), remoteBills.items)
  const remoteGoals = goalsFromSheet(tabs.Goals)
  const goals = await syncTable(token, spreadsheetId, TABS.goals, GOAL_COLUMNS, remoteGoals, (remote) => mergeNewest(localGoals, remote), remoteGoals.items)
  const synced = cash.entries.filter((e) => !gone.has(e.id)).map((e) => editedById.get(e.id) ?? e)
  const summary = summaryRows(synced, accounts)
  const summaryKey = spreadsheetId + JSON.stringify(summary)
  if (summaryKey !== lastSummary) {
    await writeWholeTab(token, spreadsheetId, TABS.summary, summary)
    lastSummary = summaryKey
  }
  const remote = portfolioFromSheet(tabs.Holdings, tabs.Transactions, tabs.Dividends, tabs.Journal)
  await syncPortfolio(token, spreadsheetId, remote, metaFromRows(tabs.Meta)[PORTFOLIO_UPDATED_AT] || undefined, startedAt)

  useCashflow.getState().applySync({
    spreadsheetId,
    synced,
    deletedIds: deleted,
    edited,
    accounts,
    bills,
    goals,
    sentIds: pending.map((e) => e.id),
    skippedRows: cash.skipped + remote.skipped + remoteAccounts.skipped + remoteBills.skipped + remoteGoals.skipped,
    at: new Date().toISOString(),
  })
}

/**
 * Small tables every device edits (accounts, bills): union by id, newest edit wins; the tab is rewritten only when it
 * differs from what was read (asRead = the Sheet's rows in merge order). Like the portfolio push, a rewrite drops
 * hand-typed rows that failed validation (they are counted as skipped).
 */
async function syncTable<T extends object>(
  token: string,
  spreadsheetId: string,
  tab: TabName,
  cols: readonly ColumnSpec[],
  remote: ParsedTable<T>,
  merge: (remote: T[]) => T[],
  asRead: readonly T[],
): Promise<T[]> {
  const merged = merge(remote.items)
  const rows = (list: readonly T[]) => list.map((x) => toRow(cols, x))
  if (JSON.stringify(rows(merged)) !== JSON.stringify(rows(asRead))) await replaceTabs(token, spreadsheetId, { [tab]: rows(merged) })
  return merged
}

async function syncPortfolio(token: string, spreadsheetId: string, remote: PortfolioData, remoteUpdatedAt: string | undefined, startedAt: string) {
  const local = useStore.getState()
  const action = portfolioSyncAction(
    { hasData: local.holdings.length > 0 || local.transactions.length > 0 || local.journal.length > 0, changedAt: local.changedAt, syncedAt: local.syncedAt },
    { hasData: remote.holdings.length > 0 || remote.journal.length > 0, updatedAt: remoteUpdatedAt },
  )
  if (action === 'none') return

  if (action === 'pull') {
    // Never overwrite an edit the user made while we were reading.
    if (useStore.getState().changedAt === local.changedAt) useStore.getState().applyPortfolioPull(remote, startedAt)
    return
  }

  const mine: PortfolioData = { holdings: local.holdings, transactions: local.transactions, dividends: local.dividends, journal: local.journal }
  const data = action === 'merge' ? mergePortfolios(mine, remote) : mine
  await replaceTabs(token, spreadsheetId, {
    [TABS.holdings]: data.holdings.map((h) => toRow(HOLDING_COLUMNS, h)),
    [TABS.transactions]: data.transactions.map((t) => toRow(TRANSACTION_COLUMNS, t)),
    [TABS.dividends]: data.dividends.map((d) => toRow(DIVIDEND_COLUMNS, d)),
    [TABS.journal]: data.journal.map((j) => toRow(JOURNAL_COLUMNS, j)),
    [TABS.meta]: [[PORTFOLIO_UPDATED_AT, startedAt]],
  })
  if (action === 'merge') useStore.getState().applyPortfolioPull(data, startedAt)
  else useStore.getState().markPortfolioSynced(startedAt)
}
