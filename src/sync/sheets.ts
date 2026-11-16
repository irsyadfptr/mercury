// Thin Google Sheets REST client for Mercury's one spreadsheet. Every call takes the token explicitly.
import { ACCOUNT_COLUMNS } from '@/domain/accounts'
import { SHEET_COLUMNS } from '@/domain/cashflow'
import { HOLDING_COLUMNS, headerRow, TRANSACTION_COLUMNS } from '@/domain/portfolioSheet'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export const TABS = {
  entries: 'Entries',
  holdings: 'Holdings',
  transactions: 'Transactions',
  accounts: 'Accounts',
  /** Key/value cells for sync bookkeeping (A: key, B: value). */
  meta: 'Meta',
} as const
export type TabName = (typeof TABS)[keyof typeof TABS]

/** Header row per tab; also decides how many columns are read back. */
const HEADERS: Record<TabName, readonly string[]> = {
  Entries: SHEET_COLUMNS,
  Holdings: headerRow(HOLDING_COLUMNS),
  Transactions: headerRow(TRANSACTION_COLUMNS),
  Accounts: headerRow(ACCOUNT_COLUMNS),
  Meta: ['key', 'value'],
}

const columnLetter = (count: number) => String.fromCharCode('A'.charCodeAt(0) + count - 1)
const dataRange = (tab: TabName) => `${tab}!A2:${columnLetter(HEADERS[tab].length)}`

export type Cell = string | number | boolean

/** HTTP failure with the status kept, so callers can tell "sign in again" (401) from "sheet gone" (404). */
export class SheetsError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new SheetsError(res.status, body?.error?.message ?? res.statusText)
  }
  return (await res.json()) as T
}

const sheetWithHeader = (tab: TabName) => ({
  properties: { title: tab, gridProperties: { frozenRowCount: 1 } },
  data: [{ startRow: 0, startColumn: 0, rowData: [{ values: HEADERS[tab].map((c) => ({ userEnteredValue: { stringValue: c }, userEnteredFormat: { textFormat: { bold: true } } })) }] }],
})

/**
 * Spreadsheets with this title that this app made for the user, on any device, oldest first (Drive API).
 * drive.file only lists files this app created, so it never sees the rest of the user's Drive.
 */
export async function findSpreadsheets(token: string, title: string): Promise<string[]> {
  const q = `name = '${title.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
  const res = await call<{ files?: { id: string }[] }>(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime&fields=files(id)&spaces=drive`)
  return (res.files ?? []).map((f) => f.id)
}

/** Creates the spreadsheet with every tab and its header row. Returns its id. */
export async function createSpreadsheet(token: string, title: string): Promise<string> {
  const body = { properties: { title }, sheets: Object.values(TABS).map(sheetWithHeader) }
  const res = await call<{ spreadsheetId: string }>(token, API, { method: 'POST', body: JSON.stringify(body) })
  return res.spreadsheetId
}

/** Adds tabs a sheet made by an older version is missing (e.g. Accounts), and rewrites every header row so new columns get names. */
export async function ensureTabs(token: string, spreadsheetId: string): Promise<void> {
  const meta = await call<{ sheets?: { properties: { title: string } }[] }>(token, `${API}/${spreadsheetId}?fields=sheets.properties.title`)
  const have = new Set((meta.sheets ?? []).map((s) => s.properties.title))
  const missing = Object.values(TABS).filter((t) => !have.has(t))
  if (missing.length)
    await call(token, `${API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((tab) => ({ addSheet: { properties: sheetWithHeader(tab).properties } })) }),
    })
  await call(token, `${API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: Object.values(TABS).map((tab) => ({ range: `${tab}!A1`, values: [HEADERS[tab]] })) }),
  })
}

/** Appends rows under the last one. RAW keeps "2026-11-13" as text instead of a date Sheets reformats. */
export async function appendRows(token: string, spreadsheetId: string, tab: TabName, rows: Cell[][]): Promise<void> {
  if (!rows.length) return
  await call(token, `${API}/${spreadsheetId}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: rows }),
  })
}

/** Data rows of several tabs in one request (header skipped), as raw cells for validation. */
export async function readTabs<T extends TabName>(token: string, spreadsheetId: string, tabs: readonly T[]): Promise<Record<T, unknown[][]>> {
  const ranges = tabs.map((t) => `ranges=${encodeURIComponent(dataRange(t))}`).join('&')
  const res = await call<{ valueRanges?: { values?: unknown[][] }[] }>(token, `${API}/${spreadsheetId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`)
  return Object.fromEntries(tabs.map((t, i) => [t, res.valueRanges?.[i]?.values ?? []])) as Record<T, unknown[][]>
}

/** Replaces the data rows of several tabs (header kept): clear, then write. */
export async function replaceTabs(token: string, spreadsheetId: string, data: Partial<Record<TabName, Cell[][]>>): Promise<void> {
  const tabs = Object.keys(data) as TabName[]
  await call(token, `${API}/${spreadsheetId}/values:batchClear`, { method: 'POST', body: JSON.stringify({ ranges: tabs.map(dataRange) }) })
  const writes = tabs.filter((t) => data[t]!.length).map((t) => ({ range: `${t}!A2`, values: data[t] }))
  if (!writes.length) return
  await call(token, `${API}/${spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: writes }) })
}

/** Writes single cells or ranges, e.g. ids filled into rows typed by hand. */
export async function writeCells(token: string, spreadsheetId: string, data: { range: string; values: Cell[][] }[]): Promise<void> {
  if (!data.length) return
  await call(token, `${API}/${spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) })
}

/**
 * Deletes whole rows of a tab. rows = 0-based sheet row indexes (0 = header), found in the read just before.
 * shortcut: a row inserted by hand in the Sheet between that read and this call shifts rows; lock by id with a Sheets developer-metadata filter if that ever bites.
 */
export async function deleteRows(token: string, spreadsheetId: string, tab: TabName, rows: readonly number[]): Promise<void> {
  if (!rows.length) return
  const meta = await call<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(token, `${API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`)
  const sheetId = meta.sheets?.find((s) => s.properties.title === tab)?.properties.sheetId
  if (sheetId === undefined) return
  // Bottom first, so earlier deletes do not move the rows still to delete.
  const requests = [...rows].sort((a, b) => b - a).map((r) => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: r, endIndex: r + 1 } } }))
  await call(token, `${API}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })
}

/** Meta tab as a key → value map. */
export const metaFromRows = (rows: readonly unknown[][]): Record<string, string> => Object.fromEntries(rows.filter((r) => r[0]).map((r) => [String(r[0]), String(r[1] ?? '')]))

export const sheetUrl = (spreadsheetId: string): string => `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
