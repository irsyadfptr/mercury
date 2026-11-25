// Quests as sentences, shared by Home's quest card and each market's fix list.
import { marketOfClass } from '@/domain/markets'
import type { Holding, I18n, Quest, QuestView } from '@/types'

/** A holding's own page: its market, on Holdings. */
const atHolding = (h: Holding) => ({ route: marketOfClass(h.assetClass), params: { view: 'holdings' } })

/** Pure: how a quest reads and where it sends you. */
export function describeQuest(q: Quest, f: I18n): QuestView {
  switch (q.kind) {
    case 'setStop':
      return { label: f.t('quest.setStop', { s: q.holding.symbol }), tag: '', ...atHolding(q.holding) }
    case 'overRisk':
      return { label: f.t('quest.overRisk', { s: q.holding.symbol, n: f.num(q.pct, 2) }), tag: '', ...atHolding(q.holding) }
    case 'stalePrice':
      return {
        label: f.t('quest.stalePrice', { s: q.holding.symbol }),
        tag: q.days == null ? f.t('quest.stalePriceNever') : f.t('quest.stalePriceAge', { d: q.days }),
        ...atHolding(q.holding),
      }
    case 'backup':
      return { label: f.t('quest.backup'), tag: q.days == null ? f.t('quest.backupNever') : f.t('quest.backupAge', { d: q.days }), route: 'settings' }
    case 'fxRate':
      return { label: f.t('quest.fxRate'), tag: '', route: 'settings' }
    case 'review':
      return { label: f.t('quest.review', { s: q.holding.symbol }), tag: f.day(q.since), route: marketOfClass(q.holding.assetClass), params: { view: 'journal', jv: 'trades' } }
  }
}
