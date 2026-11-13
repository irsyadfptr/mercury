// 8×8 pixel icon shapes, one SVG path per colour layer (DESIGN.md: icons). Kept apart from PixelIcon.tsx so fast refresh works.
function pix(rows: string[]) {
  let d = ''
  rows.forEach((r, y) => {
    for (let x = 0; x < 8; x++) if (r[x] === 'X') d += `M${x} ${y}h1v1h-1z`
  })
  return d
}

export const ICONS = {
  coin: [pix(['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'])],
  heart: [pix(['.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '........'])],
  chest: [pix(['........', '.XXXXXX.', 'X......X', 'XXXXXXXX', 'X..XX..X', 'X......X', 'XXXXXXXX', '........'])],
  star: [pix(['...XX...', '...XX...', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '.XX..XX.', 'XX....XX', '........'])],
  flame: [
    pix(['...X....', '..XX....', '..XXX.X.', '.XXXXXX.', '.XXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.']),
    pix(['........', '........', '...X....', '..XXX...', '..XXXX..', '.XXXXXX.', '.XXXXXX.', '..XXXX..']),
    pix(['........', '........', '........', '........', '...X....', '..XXX...', '..XXXX..', '...XX...']),
  ],
} as const
