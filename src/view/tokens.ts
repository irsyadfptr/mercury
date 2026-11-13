// CSS custom properties from src/index.css, named once so view code never hand-writes var() strings.
import type { AssetClass, CashCategory, CssColor, PixelIconName, Rarity, TileColors } from '@/types'

export const COLOR = {
  text: 'var(--text)',
  muted: 'var(--text-muted)',
  empty: 'var(--empty)',
  accent: 'var(--accent)',
  up: 'var(--up)',
  down: 'var(--down)',
  warn: 'var(--warn)',
  fireYellow: 'var(--fire-yellow)',
  fireOrange: 'var(--fire-orange)',
  fireRed: 'var(--fire-red)',
  fireSoft: 'var(--fire-soft)',
  fireEdge: 'var(--fire-edge)',
} as const

/** Gain / loss / flat, for numbers whose sign is the message. */
export const signColor = (n: number): CssColor => (n > 0 ? COLOR.up : n < 0 ? COLOR.down : COLOR.muted)

export const RARITY_COLOR: Record<Rarity, CssColor> = {
  common: 'var(--rarity-common)',
  rare: 'var(--rarity-rare)',
  epic: 'var(--rarity-epic)',
  legendary: 'var(--rarity-legendary)',
}

const ON_LIGHT = 'oklch(0.22 0.03 275)'
const ON_DARK = 'white'

export const ASSET_CLASS_TILE: Record<AssetClass, TileColors> = {
  idx_stock: { bg: 'var(--cat-stocks)', fg: ON_DARK },
  money_market: { bg: 'var(--cat-cash)', fg: ON_LIGHT },
  crypto: { bg: 'var(--cat-crypto)', fg: ON_DARK },
  bond_fund: { bg: 'var(--cat-bonds)', fg: ON_LIGHT },
  gold: { bg: 'var(--cat-gold)', fg: ON_LIGHT },
  us_stock: { bg: 'var(--rarity-rare)', fg: ON_DARK },
}

/**
 * Cashflow category swatches. Like asset classes, they avoid the gain/loss green and red,
 * so a category is never read as profit or loss.
 */
export const CATEGORY_COLOR: Record<CashCategory, CssColor> = {
  housing: 'var(--cat-stocks)',
  groceries: 'var(--cat-cash)',
  food: 'oklch(0.74 0.12 70)',
  transport: 'var(--cat-bonds)',
  bills: 'oklch(0.55 0.12 275)',
  health: 'oklch(0.72 0.10 220)',
  shopping: 'var(--cat-crypto)',
  entertainment: 'oklch(0.72 0.13 350)',
  family: 'oklch(0.62 0.07 60)',
  other: 'oklch(0.62 0.01 270)',
  salary: 'var(--accent)',
  bonus: 'var(--cat-gold)',
  freelance: 'oklch(0.62 0.12 300)',
  investment: 'var(--cat-bonds)',
  otherIncome: 'oklch(0.62 0.01 270)',
}

/** Pixel icon per built-in category; custom categories get a tag. */
export const CATEGORY_ICON: Record<CashCategory, PixelIconName> = {
  housing: 'house',
  groceries: 'basket',
  food: 'bowl',
  transport: 'car',
  bills: 'receipt',
  health: 'cross',
  shopping: 'bag',
  entertainment: 'gamepad',
  family: 'heart',
  other: 'dots',
  salary: 'coin',
  bonus: 'gift',
  freelance: 'laptop',
  investment: 'chartUp',
  otherIncome: 'plus',
}

export const categoryIcon = (c: string): PixelIconName => CATEGORY_ICON[c as CashCategory] ?? 'tag'

/** Hues for custom categories, skipping the green and red bands that mean gain and loss. */
const CUSTOM_HUES = [255, 92, 310, 195, 75, 350, 275, 220, 60, 300, 235, 330]

/** Built-ins use their swatch; custom names get a stable colour from their text, the same on every device. */
export function categoryColor(c: string): CssColor {
  const builtIn = CATEGORY_COLOR[c as CashCategory]
  if (builtIn) return builtIn
  let hash = 0
  for (const ch of c.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return `oklch(0.68 0.11 ${CUSTOM_HUES[hash % CUSTOM_HUES.length]})`
}
