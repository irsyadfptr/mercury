// Thin Google Sheets REST client for Mercury's one spreadsheet. Every call takes the token explicitly.
import { SHEET_COLUMNS } from '@/domain/cashflow'
import { HOLDING_COLUMNS, headerRow, TRANSACTION_COLUMNS } from '@/domain/portfolioSheet'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export const TABS = {
  entries: 'Entries',
  holdings: 'Holdings',
  transactions: 'Transactions',
  /** Key/value cells for sync bookkeeping (A: key, B: value). */
  meta: 'Meta',
} as const
export type TabName = (typeof TABS)[keyof typeof TABS]

/** Header row per tab; also decides how many columns are read back. */
const HEADERS: Record<TabName, readonly string[]> = {
  Entries: SHEET_COLUMNS,
  Holdings: headerRow(HOLDING_COLUMNS),
  Transactions: headerRow(TRANSACTION_COLUMNS),
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

/** Creates the spreadsheet with every tab and its header row. Returns its id. */
export async function createSpreadsheet(token: string, title: string): Promise<string> {
  const body = { properties: { title }, sheets: Object.values(TABS).map(sheetWithHeader) }
  const res = await call<{ spreadsheetId: string }>(token, API, { method: 'POST', body: JSON.stringify(body) })
  return res.spreadsheetId
}

/** Adds tabs a sheet made by an older version is missing (e.g. Holdings), with their header rows. */
export async function ensureTabs(token: string, spreadsheetId: string): Promise<void> {
  const meta = await call<{ sheets?: { properties: { title: string } }[] }>(token, `${API}/${spreadsheetId}?fields=sheets.properties.title`)
  const have = new Set((meta.sheets ?? []).map((s) => s.properties.title))
  const missing = Object.values(TABS).filter((t) => !have.has(t))
  if (!missing.length) return
  await call(token, `${API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: missing.map((tab) => ({ addSheet: { properties: sheetWithHeader(tab).properties } })) }),
  })
  await call(token, `${API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: missing.map((tab) => ({ range: `${tab}!A1`, values: [HEADERS[tab]] })) }),
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

/** Meta tab as a key → value map. */
export const metaFromRows = (rows: readonly unknown[][]): Record<string, string> => Object.fromEntries(rows.filter((r) => r[0]).map((r) => [String(r[0]), String(r[1] ?? '')]))

export const sheetUrl = (spreadsheetId: string): string => `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
