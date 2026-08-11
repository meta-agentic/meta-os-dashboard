// Theme manifest for the picker — swatches and provenance only; the authoritative
// token values live in styles.css. Both files are emitted by scratchpad/gen-themes.mjs.
//
// 'editor' themes pass every dataviz check. 'statement' themes deliberately keep
// their authentic neon/analogous hues and therefore fail some — `tradeoffs` lists
// exactly which, so the picker can say so instead of shipping a silent compromise.
// Both chart types carry text identity (pie legend labels, bar row labels), which is
// the secondary encoding those trades are conditional on.
export const THEMES = [
  {
    key: 'graphite', label: 'Graphite', note: 'the original — GitHub-flavoured neutral', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#0d1117', card: '#161b22', fg: '#e6edf3', accent: '#58a6ff', cat: ['#d77122', '#4593ea', '#2eac43', '#a16ff5', '#bc8500', '#00a4ae', '#e3625a', '#915e00'] },
    light: { bg: '#ffffff', card: '#f6f8fa', fg: '#1f2328', accent: '#0969da', cat: ['#d0242f', '#0c6bdc', '#bb4b00', '#8351e0', '#006324', '#009aa3', '#7c3e00', '#b8822a'] },
  },
  {
    key: 'nord', label: 'Nord', note: 'arctic, north-bluish — Polar Night & Frost', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#272b35', card: '#2e3440', fg: '#eceff4', accent: '#88c0d0', cat: ['#bc74b0', '#769f4e', '#4881c4', '#b38a29', '#5096d6', '#ce7559', '#00a1c0', '#bf616a'] },
    light: { bg: '#eceff4', card: '#e5e9f0', fg: '#2e3440', accent: '#5e81ac', cat: ['#9a538c', '#a37b10', '#195f9c', '#c1684f', '#0090ae', '#a04650', '#4881c4', '#5c8f43'] },
  },
  {
    key: 'solarized', label: 'Solarized', note: 'Ethan Schoonover’s canonical light + dark pair', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#002b36', card: '#073642', fg: '#eee8d5', accent: '#268bd2', cat: ['#268bd2', '#d35321', '#7075c8', '#889c0b', '#db3e89', '#b58901', '#008f86', '#e63e38'] },
    light: { bg: '#fdf6e3', card: '#eee8d5', fg: '#073642', accent: '#268bd2', cat: ['#7a8c00', '#6d72c5', '#cc4c18', '#2288cf', '#d43783', '#7f5f00', '#009289', '#c6121a'] },
  },
  {
    key: 'gruvbox', label: 'Gruvbox', note: 'warm retro groove, heavy on the earth tones', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#282828', card: '#32302f', fg: '#ebdbb2', accent: '#83a598', cat: ['#c96c88', '#959800', '#b45e86', '#b88700', '#009499', '#de6c00', '#1ca27f', '#f94732'] },
    light: { bg: '#fbf1c7', card: '#f2e5bc', fg: '#3c3836', accent: '#076678', cat: ['#797400', '#8e3e70', '#b1720b', '#00879f', '#8d2b00', '#d45b08', '#9c0005', '#31905c'] },
  },
  {
    key: 'tokyonight', label: 'Tokyo Night', note: 'neon-on-navy; Day is the official light sibling', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#1a1b26', card: '#24283b', fg: '#c0caf5', accent: '#7aa2f7', cat: ['#00a2ba', '#d2753a', '#678ee1', '#bb852e', '#369bd0', '#c34763', '#9d7cd6', '#74a13d'] },
    light: { bg: '#e1e2e7', card: '#d9dae3', fg: '#3760bf', accent: '#2e7de9', cat: ['#0084b0', '#804000', '#2978e4', '#527823', '#9854f1', '#9a6700', '#3861c0', '#ea195d'] },
  },
  {
    key: 'catppuccin', label: 'Catppuccin', note: 'pastel Mocha & Latte — soothing, high-comfort', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#1e1e2e', card: '#313244', fg: '#cdd6f4', accent: '#89b4fa', cat: ['#be73ac', '#b18b28', '#6491da', '#c97a46', '#0088b2', '#62a35e', '#7f89d9', '#c46679'] },
    light: { bg: '#eff1f5', card: '#e6e9ef', fg: '#4c4f69', accent: '#1e66f5', cat: ['#d4133a', '#1d65f4', '#df5500', '#8839ef', '#36971f', '#95257d', '#b97200'] },
  },
  {
    key: 'rosepine', label: 'Rosé Pine', note: 'soho vibes for the terminal — Main & Dawn', variant: 'editor',
    tradeoffs: [],
    dark: { bg: '#191724', card: '#1f1d2e', fg: '#e0def4', accent: '#c4a7e7', cat: ['#a27dcb', '#bb852e', '#008eb9', '#d07170', '#7464b3', '#dc6285', '#219eca', '#815ca8'] },
    light: { bg: '#faf4ed', card: '#fffaf3', fg: '#575279', accent: '#907aa9', cat: ['#007599', '#c77e00', '#0088b1', '#8d3636', '#a680ce', '#842e4b', '#0099ac'] },
  },
  {
    key: 'claude', label: 'Claude', note: 'Anthropic’s own language — clay on cream paper', variant: 'statement',
    tradeoffs: ['marks sit outside the even-lightness band', 'some marks read close to grey', 'adjacent marks are close even with full colour vision'],
    dark: { bg: '#1a1915', card: '#23221d', fg: '#f0eee6', accent: '#d97757', cat: ['#ba4c44', '#fbd271', '#5c8c68', '#aece74', '#367490', '#ef8b6a', '#8a5f99', '#af8c69'] },
    light: { bg: '#f0eee6', card: '#faf9f5', fg: '#191917', accent: '#c15f3c', cat: ['#987757', '#660007', '#d77250', '#1c5e7e', '#b7843a', '#59316a', '#799a4a', '#3b7a55'] },
  },
  {
    key: 'cyberpunk', label: 'Cyberpunk 2077', note: 'Night City — neon yellow, cyan and hot magenta on black', variant: 'statement',
    tradeoffs: ['marks sit outside the even-lightness band', 'adjacent marks are hard to tell apart with colour-vision deficiency'],
    dark: { bg: '#050505', card: '#0f0f08', fg: '#f5f2dc', accent: '#fcee0a', cat: ['#00f0a8', '#ff003c', '#fcee0a', '#00f0ff', '#ff9f1c', '#c400ff', '#9bff00', '#ff57b9'] },
    light: { bg: '#edebdd', card: '#f7f5e8', fg: '#14140a', accent: '#a38a00', cat: ['#4f7a00', '#7b00a8', '#8a7500', '#b3007a', '#b35c00', '#0071a8', '#c4002f', '#00805c'] },
  },
  {
    key: 'starbase', label: 'Starbase', note: 'launch-pad minimal — pure black, white, one cold blue', variant: 'statement',
    tradeoffs: ['marks sit outside the even-lightness band', 'some marks read close to grey'],
    dark: { bg: '#000000', card: '#0a0e13', fg: '#ffffff', accent: '#3f8efc', cat: ['#e8b33a', '#3f8efc', '#2fbf71', '#7c5cff', '#ff4c4c', '#00c9c9', '#ff8a3d', '#9aa7b4'] },
    light: { bg: '#ffffff', card: '#f4f6f8', fg: '#05080b', accent: '#0056d6', cat: ['#9a6f10', '#0056d6', '#1a7f4b', '#5a3fd6', '#cc2b2b', '#007a7a', '#c25a12', '#5b646d'] },
  },
  {
    key: 'outrun', label: 'Outrun', note: 'synthwave sunset — hot pink and cyan on deep violet', variant: 'statement',
    tradeoffs: ['marks sit outside the even-lightness band', 'some marks read close to grey'],
    dark: { bg: '#190b2e', card: '#241241', fg: '#f7e8ff', accent: '#ff3dae', cat: ['#c77dff', '#00e5c0', '#7b5cff', '#ffb627', '#ff3dae', '#f9f871', '#ff6b35', '#45caff'] },
    light: { bg: '#fdf0ff', card: '#fff8ff', fg: '#2a0b3d', accent: '#c4187e', cat: ['#0077a8', '#c4451a', '#5a3fd6', '#00806c', '#8e3fd6', '#a86a00', '#c4187e', '#6e7a00'] },
  },
  {
    key: 'phosphor', label: 'Phosphor', note: 'CRT terminal — one green, black glass, no comfort', variant: 'statement',
    tradeoffs: ['marks sit outside the even-lightness band', 'some marks read close to grey'],
    dark: { bg: '#000700', card: '#041104', fg: '#c6ffc6', accent: '#00ff66', cat: ['#b09100', '#126787', '#b8ee1e', '#00993a', '#7edb6a', '#007e56', '#5fc700', '#ae382d'] },
    light: { bg: '#eaf7ea', card: '#f5fcf5', fg: '#04240a', accent: '#00803a', cat: ['#006a2e', '#ad8c36', '#275100', '#82982b', '#003755', '#26927c', '#c0261c', '#5e9f4e'] },
  },
  {
    key: 'mars', label: 'Mars', note: 'regolith and rust — fully warm, not a blue in sight', variant: 'statement',
    tradeoffs: ['marks sit outside the even-lightness band', 'some marks read close to grey', 'adjacent marks are close even with full colour vision'],
    dark: { bg: '#170d08', card: '#21140d', fg: '#f5e0ce', accent: '#e2703a', cat: ['#965735', '#ffce93', '#6a895e', '#eeb46f', '#af4119', '#c3a93f', '#865c33', '#e16f39'] },
    light: { bg: '#f7ede2', card: '#fdf6ee', fg: '#2b1508', accent: '#b4501f', cat: ['#a07545', '#472c0c', '#d76f41', '#67351b', '#a28b3b', '#45603b', '#ba813e', '#af4323'] },
  },
]

export const DEFAULT_THEME = 'graphite'
export const themeByKey = (k) => THEMES.find((t) => t.key === k) ?? THEMES[0]
export const VARIANTS = [
  { key: 'editor', label: 'Editor', note: 'calm, and every chart palette passes the colour checks' },
  { key: 'statement', label: 'Statement', note: 'louder — authentic hues, with the colour trade listed per theme' },
]
