import { PixelIcon } from './PixelIcon'

const fabClass =
  'fab fab-enter group fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 block size-16 rounded-lg focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none sm:right-6 sm:bottom-6'

/**
 * The gold pixel-block "+" button, fixed at the bottom right (above the phone tab bar) (styles: .fab in index.css). A link with `href`, else a
 * button. Leave room under the page's last card (an h-16 spacer) so it never covers it.
 */
export function PixelFab({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span aria-hidden="true" className="fab-shadow pixel-block absolute inset-0" />
      <span aria-hidden="true" className="fab-body pixel-block absolute inset-0 grid place-items-center">
        <span className="fab-face pixel-block absolute inset-[3px] grid place-items-center">
          <PixelIcon name="plus" size={26} color="oklch(0.24 0.03 275)" className="relative" />
        </span>
      </span>
      <span aria-hidden="true" className="fab-spark -top-1.5 -left-1" />
      <span aria-hidden="true" className="fab-spark top-2 -right-2" />
    </>
  )
  return href ? (
    <a href={href} aria-label={label} title={label} className={fabClass}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={fabClass}>
      {inner}
    </button>
  )
}
