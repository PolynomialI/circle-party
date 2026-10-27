// The one theme every screen and game uses. Values are taken from Circle Soccer.

export const THEME = {
  bg: '#0d1b14', // page background
  void: '#10241a', // canvas background
  panel: '#13241b',
  hud: '#0f1d15', // dark HUD blocks
  card: 'rgba(255, 255, 255, 0.06)',
  button: 'rgba(255, 255, 255, 0.08)',
  buttonHover: 'rgba(255, 255, 255, 0.16)',
  line: 'rgba(255, 255, 255, 0.12)',
  dim: 'rgba(5, 12, 8, 0.6)', // overlay behind panels
  text: '#eef5ef',
  muted: '#9db5a4',
  accent: '#ffd447',
  accentHover: '#ffe07a',
  accentText: '#1d1a08',
  meName: '#ffe680',
  white: '#ffffff',
  chalk: 'rgba(255, 255, 255, 0.8)', // pitch lines
  rim: '#23662f', // pitch surround
  grass: ['#2f803a', '#338a3f'], // pitch stripes
  ice: '#9cc4ff',
  post: '#f4f4f4',
  postLine: 'rgba(0, 0, 0, 0.45)',
  barBack: 'rgba(0, 0, 0, 0.45)',
  ready: '#7cf29a',
  notReady: '#f2b84b',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, monospace',
  outline: 2, // player outline width
  meRing: 2, // white ring around your own player, drawn at r + 3
  lineWidth: 3, // pitch lines and effect rings
  chargeWidth: 3.5,
};

// Player colours: Circle Soccer's team and power-up colours, each with a darker outline shade.
// The first two double as the red and blue teams.
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
