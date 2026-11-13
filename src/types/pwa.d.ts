// Chrome's install prompt event (not in the DOM lib yet) and iOS Safari's standalone flag.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}

interface Navigator {
  /** iOS Safari: true when opened from the home screen. */
  readonly standalone?: boolean
}
