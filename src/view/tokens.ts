// CSS custom properties from src/index.css, named once so view code never hand-writes var() strings.
import type { AssetClass, CssColor, Rarity, TileColors } from '@/types'

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
