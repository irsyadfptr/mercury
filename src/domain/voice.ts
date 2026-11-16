// Turns a speech-to-text transcript into a Quick add draft with plain word rules (no AI). Pure: every input is a parameter.
// Supported phrases are listed in NOTES.md ("Voice Quick add"). Anything not understood stays in the note.
import type { Account, CustomCategory, VoiceDraft } from '@/types'
import { DEFAULT_ACCOUNT_ID, EXPENSE_CATEGORIES, TRANSFER } from './schema'

const UNITS: Record<string, number> = {
  nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, setengah: 0.5,
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, half: 0.5,
}
/** Multiply only the last small number: "dua ratus lima puluh" = 250. */
const SMALL: Record<string, number> = { puluh: 10, ratus: 100, hundred: 100 }
/** Close a group: "dua puluh lima ribu" = 25 × 1000. */
const BIG: Record<string, number> = {
  ribu: 1e3, rb: 1e3, k: 1e3, thousand: 1e3, juta: 1e6, jt: 1e6, million: 1e6, mio: 1e6, miliar: 1e9, milyar: 1e9, billion: 1e9,
}
/** "seratus" = satu ratus, "seribu" = satu ribu, "sejuta" = satu juta. */
const SE: Record<string, string[]> = { seratus: ['satu', 'ratus'], seribu: ['satu', 'ribu'], sejuta: ['satu', 'juta'], semiliar: ['satu', 'miliar'] }

const CATEGORY_WORDS: Record<string, string> = {
  // expense
  makan: 'food', makanan: 'food', minum: 'food', kopi: 'food', jajan: 'food', sarapan: 'food', snack: 'food',
  lunch: 'food', dinner: 'food', breakfast: 'food', food: 'food', coffee: 'food', meal: 'food',
  sayur: 'groceries', dapur: 'groceries', indomaret: 'groceries', alfamart: 'groceries', supermarket: 'groceries', groceries: 'groceries', grocery: 'groceries',
  bensin: 'transport', parkir: 'transport', ojek: 'transport', ojol: 'transport', gojek: 'transport', grab: 'transport', tol: 'transport', kereta: 'transport',
  krl: 'transport', bus: 'transport', taksi: 'transport', transport: 'transport', fuel: 'transport', petrol: 'transport', gas: 'transport', parking: 'transport', taxi: 'transport',
  listrik: 'bills', pln: 'bills', pdam: 'bills', internet: 'bills', wifi: 'bills', pulsa: 'bills', tagihan: 'bills', electricity: 'bills', bill: 'bills', bills: 'bills',
  sewa: 'housing', kos: 'housing', kost: 'housing', kontrakan: 'housing', rent: 'housing',
  obat: 'health', dokter: 'health', apotek: 'health', medicine: 'health', doctor: 'health', pharmacy: 'health',
  belanja: 'shopping', baju: 'shopping', sepatu: 'shopping', shopee: 'shopping', tokopedia: 'shopping', shopping: 'shopping', clothes: 'shopping',
  nonton: 'entertainment', bioskop: 'entertainment', film: 'entertainment', movie: 'entertainment', netflix: 'entertainment', spotify: 'entertainment',
  keluarga: 'family', anak: 'family', ortu: 'family', family: 'family',
  // income
  gaji: 'salary', gajian: 'salary', salary: 'salary', bonus: 'bonus', thr: 'bonus', freelance: 'freelance', proyek: 'freelance', project: 'freelance',
  dividen: 'investment', dividend: 'investment', bunga: 'investment', interest: 'investment',
}
const TRANSFER_WORDS = new Set(['transfer', 'tf', 'pindah', 'tarik', 'withdraw'])
const INCOME_WORDS = new Set(['terima', 'dapat', 'masuk', 'pemasukan', 'income', 'received', 'got', 'earned'])
const EXPENSE_WORDS = new Set(['beli', 'bayar', 'keluar', 'pengeluaran', 'spent', 'paid', 'pay', 'buy', 'bought'])
const TO_WORDS = new Set(['ke', 'to', 'into'])
const FROM_WORDS = new Set(['pakai', 'pake', 'dari', 'lewat', 'via', 'with', 'from', 'using', 'use', 'by'])
const FILLER = new Set(['rp', 'rupiah', 'idr', 'tunai'])
/** Spoken words for the default account when no account has that name. */
const CASH_WORDS = new Set(['cash', 'tunai'])

const expense = new Set<string>(EXPENSE_CATEGORIES)

/** "25.000" / "1,500" = thousands; "1,5" / "1.5" = decimal. */
function digitValue(token: string): number | undefined {
  if (/^\d{1,3}([.,]\d{3})+$/.test(token)) return Number(token.replace(/[.,]/g, ''))
  if (/^\d+([.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'))
  return undefined
}

const isNumberWord = (t: string) => digitValue(t) !== undefined || t in UNITS || t in SE
const isPartOfNumber = (t: string) => isNumberWord(t) || t in SMALL || t in BIG || t === 'belas'

/** Value of a run of number tokens, e.g. ["dua","puluh","lima","ribu"] → 25 000. */
function numberValue(run: readonly string[]): number {
  let total = 0
  let current = 0
  let last = 0
  for (const t of run) {
    const d = digitValue(t) ?? UNITS[t]
    if (d !== undefined) {
      current += d
      last = d
    } else if (t === 'belas') {
      current += 10 // "dua belas" = 2 + 10
      last = 0
    } else if (t in SMALL) {
      current += last * (SMALL[t] - 1) + (last ? 0 : SMALL[t]) // "ratus" alone = 100
      last = 0
    } else if (t in BIG) {
      total += (current || 1) * BIG[t]
      current = 0
      last = 0
    }
  }
  return Math.round(total + current)
}

/** Lower case, "Rp25.000" → "25.000", "25rb" → "25 rb", "seratus" → "satu ratus"; punctuation dropped. */
function tokenize(text: string): string[] {
  const spaced = text
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
  return spaced
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .flatMap((t) => SE[t] ?? [t])
}

const words = (name: string) => tokenize(name)

/**
 * Reads type, amount, category and accounts from a transcript. accounts = the user's active accounts;
 * custom = categories the user made (matched by their one-word name). Never guesses: unknown parts go to note.
 */
export function parseVoice(transcript: string, accounts: readonly Account[], custom: readonly CustomCategory[] = []): VoiceDraft {
  const tokens = tokenize(transcript)
  const used = new Array<boolean>(tokens.length).fill(false)
  const draft: VoiceDraft = { note: '' }

  // Accounts, longest names first so "Bank Jago" wins over "Jago". The word before says the role.
  const found: { at: number; id: string; to: boolean }[] = []
  const byLength = [...accounts].sort((a, b) => words(b.name).length - words(a.name).length)
  for (const a of byLength) {
    const name = words(a.name)
    for (let i = 0; i + name.length <= tokens.length; i++) {
      if (name.some((w, j) => used[i + j] || tokens[i + j] !== w)) continue
      name.forEach((_, j) => (used[i + j] = true))
      const before = tokens[i - 1]
      const to = TO_WORDS.has(before)
      if (i > 0 && !used[i - 1] && (to || FROM_WORDS.has(before))) used[i - 1] = true
      found.push({ at: i, id: a.id, to })
    }
  }
  // "cash" / "tunai" mean the default account when no account is called that.
  tokens.forEach((t, i) => {
    if (used[i] || !CASH_WORDS.has(t) || !accounts.some((a) => a.id === DEFAULT_ACCOUNT_ID)) return
    used[i] = true
    // "tarik tunai" (cash withdrawal) moves money into cash.
    const to = TO_WORDS.has(tokens[i - 1]) || tokens[i - 1] === 'tarik'
    if (i > 0 && !used[i - 1] && (TO_WORDS.has(tokens[i - 1]) || FROM_WORDS.has(tokens[i - 1]))) used[i - 1] = true
    found.push({ at: i, id: DEFAULT_ACCOUNT_ID, to })
  })
  found.sort((a, b) => a.at - b.at)

  // Amount: the first run of number words.
  for (let i = 0; i < tokens.length && draft.amount === undefined; i++) {
    if (used[i] || !isNumberWord(tokens[i])) continue
    let end = i
    while (end < tokens.length && !used[end] && isPartOfNumber(tokens[end])) end++
    const value = numberValue(tokens.slice(i, end))
    if (value > 0) {
      draft.amount = value
      for (let j = i; j < end; j++) used[j] = true
    }
  }

  // Type and category words.
  const customByName = new Map(custom.map((c) => [c.name.toLowerCase(), c]))
  let categoryType: VoiceDraft['type']
  tokens.forEach((t, i) => {
    if (used[i]) return
    if (TRANSFER_WORDS.has(t)) draft.type = TRANSFER
    else if (!draft.category && customByName.has(t)) {
      draft.category = customByName.get(t)!.name
      categoryType = customByName.get(t)!.type
    } else if (!draft.category && CATEGORY_WORDS[t]) {
      draft.category = CATEGORY_WORDS[t]
      categoryType = expense.has(draft.category) ? 'expense' : 'income'
    } else if (INCOME_WORDS.has(t)) draft.type ??= 'income'
    else if (EXPENSE_WORDS.has(t)) draft.type ??= 'expense'
    else if (!FILLER.has(t)) return
    used[i] = true
  })
  // The category decides expense vs income ("gaji" is income even after "dapat"); a transfer has no category.
  if (draft.type === TRANSFER) draft.category = undefined
  else if (categoryType) draft.type = categoryType

  // Accounts: a transfer takes from (first not after "ke"/"to") and to; anything else takes one account.
  const from = found.find((f) => !f.to)
  const to = found.find((f) => f.to && f !== from)
  if (draft.type === TRANSFER) {
    draft.account = from?.id
    draft.toAccount = (to ?? found.find((f) => f !== from))?.id
  } else if (found.length) draft.account = (from ?? found[0]).id

  draft.note = tokens.filter((_, i) => !used[i]).join(' ')
  return draft
}
