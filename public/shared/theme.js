// The one theme every screen and game uses: a cartoon sci-fi facility seen from above.
// Pale blue floors, slate machinery with dark navy outlines, yellow hazard stripes.

export const THEME = {
  // page and UI
  page: '#d3e3fa',
  card: '#eef4fd',
  ink: '#262a36', // outlines and text
  inkSoft: '#526476',
  muted: '#6b7c93',
  accent: '#f2c23a', // hazard yellow
  accentHover: '#f7d462',
  button: '#526476',
  buttonHover: '#616f7f',
  dim: 'rgba(38, 42, 54, 0.55)', // overlay behind panels
  white: '#ffffff',
  good: '#3fbf6a',

  // world
  void: '#262a36', // outside the map, pits
  dark: '#1c2029', // unlit areas in the dark games
  floor: '#d3e3fa',
  floorAlt: '#c6d9f5',
  floorWarm: '#e6e1f3',
  floorMint: '#cfeee4',
  decal: '#acc9f3', // painted floor markings
  seam: '#bfd3f1', // floor plate seams
  wallTop: '#616f7f',
  wallRim: '#748296',
  wallSide: '#474d5a',
  wallInner: '#526476',
  metal: '#939eaf',
  metalDark: '#6b7683',
  teal: '#395062',
  crate: '#e8a33a',
  crateDark: '#b9771f',
  ice: '#f4f9ff',
  danger: '#d53a4a',
  shadow: 'rgba(38, 42, 54, 0.2)', // flat offset shadow under walls and props
  gun: '#b5c2d2',

  // sizes
  font: '"Fredoka", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, monospace',
  outline: 3, // outline width for players, walls and props
  lineWidth: 3,
  chargeWidth: 4,
  shadowOffset: 6,
  wallSideH: 12, // height of the darker front face drawn at the bottom of walls
};

// Player colours, each with a darker shade for details. The first two double as teams.
export const COLORS = [
  { name: 'Red', main: '#ef4b4b', dark: '#9e2424' },
  { name: 'Blue', main: '#3d8bff', dark: '#1d4fa8' },
  { name: 'Yellow', main: '#ffd447', dark: '#a8851a' },
  { name: 'Green', main: '#59e07a', dark: '#24873d' },
  { name: 'Orange', main: '#ff8a3d', dark: '#a84f17' },
  { name: 'Purple', main: '#b77bff', dark: '#6a37ad' },
  { name: 'Cyan', main: '#4fd1ff', dark: '#1a78a0' },
  { name: 'Pink', main: '#ff6fb5', dark: '#a8306c' },
];
