// Quests as sentences, shared by the Dashboard's quest card and the Portfolio's fix list.
import type { I18n, Quest, QuestView } from '@/types'

/** Pure: how a quest reads and where it sends you. */
export function describeQuest(q: Quest, f: I18n): QuestView {
  switch (q.kind) {
    case 'setStop':
      return { label: f.t('quest.setStop', { s: q.holding.symbol }), tag: '', route: 'portfolio' }
    case 'overRisk':
      return { label: f.t('quest.overRisk', { s: q.holding.symbol, n: f.num(q.pct, 2) }), tag: '', route: 'portfolio' }
    case 'stalePrice':
      return {
        label: f.t('quest.stalePrice', { s: q.holding.symbol }),
        tag: q.days == null ? f.t('quest.stalePriceNever') : f.t('quest.stalePriceAge', { d: q.days }),
        route: 'portfolio',
      }
    case 'backup':
      return { label: f.t('quest.backup'), tag: q.days == null ? f.t('quest.backupNever') : f.t('quest.backupAge', { d: q.days }), route: 'settings' }
    case 'fxRate':
      return { label: f.t('quest.fxRate'), tag: '', route: 'settings' }
    case 'review':
      return { label: f.t('quest.review', { s: q.holding.symbol }), tag: f.day(q.since), route: 'journal', params: { view: 'trades' } }
  }
}
