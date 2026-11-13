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
  // Cashflow categories (single layer, coloured by the category swatch).
  house: [pix(['...XX...', '..XXXX..', '.XXXXXX.', 'XXXXXXXX', '.X....X.', '.X.XX.X.', '.X.XX.X.', '.XXXXXX.'])],
  basket: [pix(['..X..X..', '.X....X.', 'XXXXXXXX', 'X.X.X.XX', '.XXXXXX.', '.X.X.XX.', '..XXXX..', '........'])],
  bowl: [pix(['.X.X.X..', 'X.X.X...', '........', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '........'])],
  car: [pix(['........', '..XXXX..', '.X....X.', 'XXXXXXXX', 'XXXXXXXX', 'XX....XX', '.XX..XX.', '........'])],
  receipt: [pix(['.XXXXXX.', '.X....X.', '.X.XX.X.', '.X....X.', '.X.XX.X.', '.X....X.', '.XXXXXX.', '.X.X.X..'])],
  cross: [pix(['..XXXX..', '..XXXX..', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '..XXXX..', '..XXXX..', '........'])],
  bag: [pix(['..XXXX..', '.X....X.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '........'])],
  gamepad: [pix(['........', '.XXXXXX.', 'XX.XXXXX', 'X...XX.X', 'XX.XXXXX', 'XXXXXXXX', 'XX....XX', '........'])],
  dots: [pix(['........', '........', '........', 'XX.XX.XX', 'XX.XX.XX', '........', '........', '........'])],
  gift: [pix(['.X...X..', '..X.X...', 'XXXXXXXX', 'XXX.XXXX', '.XX.XXX.', '.XX.XXX.', '.XX.XXX.', '.XXXXXX.'])],
  laptop: [pix(['........', '.XXXXXX.', '.X....X.', '.X....X.', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '........'])],
  chartUp: [pix(['.......X', '......XX', '.....X.X', 'X...X...', 'XX.X....', 'X.X.....', 'X.......', 'XXXXXXXX'])],
  plus: [pix(['...XX...', '...XX...', '...XX...', 'XXXXXXXX', 'XXXXXXXX', '...XX...', '...XX...', '...XX...'])],
  tag: [pix(['XXXX....', 'X..XX...', 'X..XXX..', 'XXXXXXX.', '.XXXXXXX', '..XXXXX.', '...XXX..', '....X...'])],
  // Money out / in.
  arrowDown: [pix(['...XX...', '...XX...', '...XX...', '...XX...', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'])],
  arrowUp: [pix(['...XX...', '..XXXX..', '.XXXXXX.', 'XXXXXXXX', '...XX...', '...XX...', '...XX...', '...XX...'])],
} as const
