// One sync pass for everything in the Sheet:
// 1. make sure the spreadsheet and its tabs exist,
// 2. append the cashflow offline queue,
// 3. read all tabs once,
// 4. cashflow: take the Sheet's entries; portfolio: push, pull or merge by portfolioSyncAction.
import { useCashflow } from '@/cashflowStore'
import { ACCOUNT_COLUMNS, accountsFromSheet, mergeAccounts } from '@/domain/accounts'
import { entryToRow, rowsToEntries } from '@/domain/cashflow'
import { HOLDING_COLUMNS, mergePortfolios, portfolioFromSheet, portfolioSyncAction, toRow, TRANSACTION_COLUMNS } from '@/domain/portfolioSheet'
import { useStore } from '@/store'
import type { PortfolioData } from '@/types'
import { appendRows, createSpreadsheet, deleteRows, ensureTabs, metaFromRows, readTabs, replaceTabs, SheetsError, TABS, writeCells } from './sheets'

export const SHEET_TITLE = 'Mercury Cashflow'
const PORTFOLIO_UPDATED_AT = 'portfolioUpdatedAt'

let running: Promise<void> | undefined

/** Runs one sync with the given token. Concurrent calls share the running pass instead of double-appending. */
export function syncSheets(token: string): Promise<void> {
  running ??= run(token).finally(() => {
    running = undefined
  })
  return running
}

/** The linked spreadsheet, upgraded with any missing tabs; a new one if it was deleted or never made. */
async function spreadsheet(token: string, linked: string | undefined): Promise<string> {
  if (!linked) return createSpreadsheet(token, SHEET_TITLE)
  try {
    await ensureTabs(token, linked)
    return linked
  } catch (e) {
    if (e instanceof SheetsError && e.status === 404) return createSpreadsheet(token, SHEET_TITLE)
    throw e
  }
}

async function run(token: string): Promise<void> {
  // Edits made while this pass runs are newer than startedAt, so they stay "unsynced" for the next pass.
  const startedAt = new Date().toISOString()
  const { spreadsheetId: linked, pending, accounts: localAccounts, deleted } = useCashflow.getState()
  const spreadsheetId = await spreadsheet(token, linked)

  await appendRows(token, spreadsheetId, TABS.entries, pending.map(entryToRow))
  const tabs = await readTabs(token, spreadsheetId, [TABS.entries, TABS.holdings, TABS.transactions, TABS.accounts, TABS.meta])

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
  // Entries deleted in the app: remove their rows (0-based sheet index = data index + 1 for the header).
  const gone = new Set(deleted)
  await deleteRows(token, spreadsheetId, TABS.entries, tabs.Entries.flatMap((r, i) => (gone.has(String(r[0] ?? '').trim()) ? [i + 1] : [])))
  // Accounts: union by id, newest edit wins; write back only when the Sheet differs.
  const remoteAccounts = accountsFromSheet(tabs.Accounts)
  const accounts = mergeAccounts(localAccounts, remoteAccounts.items)
  const rows = (list: typeof accounts) => list.map((a) => toRow(ACCOUNT_COLUMNS, a))
  const accountRows = rows(accounts)
  // Like the portfolio push, a rewrite drops hand-typed rows that failed validation (they are counted as skipped).
  if (JSON.stringify(accountRows) !== JSON.stringify(rows(mergeAccounts([], remoteAccounts.items))))
    await replaceTabs(token, spreadsheetId, { [TABS.accounts]: accountRows })
  const remote = portfolioFromSheet(tabs.Holdings, tabs.Transactions)
  await syncPortfolio(token, spreadsheetId, remote, metaFromRows(tabs.Meta)[PORTFOLIO_UPDATED_AT] || undefined, startedAt)

  useCashflow.getState().applySync({
    spreadsheetId,
    synced: cash.entries.filter((e) => !gone.has(e.id)),
    deletedIds: deleted,
    accounts,
    sentIds: pending.map((e) => e.id),
    skippedRows: cash.skipped + remote.skipped + remoteAccounts.skipped,
    at: new Date().toISOString(),
  })
}

async function syncPortfolio(token: string, spreadsheetId: string, remote: PortfolioData, remoteUpdatedAt: string | undefined, startedAt: string) {
  const local = useStore.getState()
  const action = portfolioSyncAction(
    { hasData: local.holdings.length > 0 || local.transactions.length > 0, changedAt: local.changedAt, syncedAt: local.syncedAt },
    { hasData: remote.holdings.length > 0, updatedAt: remoteUpdatedAt },
  )
  if (action === 'none') return

  if (action === 'pull') {
    // Never overwrite an edit the user made while we were reading.
    if (useStore.getState().changedAt === local.changedAt) useStore.getState().applyPortfolioPull(remote, startedAt)
    return
  }

  const data: PortfolioData = action === 'merge' ? mergePortfolios(local, remote) : { holdings: local.holdings, transactions: local.transactions }
  await replaceTabs(token, spreadsheetId, {
    [TABS.holdings]: data.holdings.map((h) => toRow(HOLDING_COLUMNS, h)),
    [TABS.transactions]: data.transactions.map((t) => toRow(TRANSACTION_COLUMNS, t)),
    [TABS.meta]: [[PORTFOLIO_UPDATED_AT, startedAt]],
  })
  if (action === 'merge') useStore.getState().applyPortfolioPull(data, startedAt)
  else useStore.getState().markPortfolioSynced(startedAt)
}
