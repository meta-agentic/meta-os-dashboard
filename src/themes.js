// Theme manifest for the picker — swatches only. The authoritative token values
// live in styles.css; these mirror just enough to draw a preview without applying
// the theme first. Both files are emitted by scratchpad/gen-themes.mjs, so a theme
// added there must be regenerated into both.
export const THEMES = [
  {
    key: 'graphite', label: 'Graphite', note: 'the original — GitHub-flavoured neutral',
    dark: { bg: '#0d1117', card: '#161b22', fg: '#e6edf3', accent: '#58a6ff', cat: ['#d77122', '#4593ea', '#2eac43', '#a16ff5', '#bc8500', '#00a4ae', '#e3625a', '#915e00'] },
    light: { bg: '#ffffff', card: '#f6f8fa', fg: '#1f2328', accent: '#0969da', cat: ['#d0242f', '#0c6bdc', '#bb4b00', '#8351e0', '#006324', '#009aa3', '#7c3e00', '#b8822a'] },
  },
  {
    key: 'nord', label: 'Nord', note: 'arctic, north-bluish — Polar Night & Frost',
    dark: { bg: '#272b35', card: '#2e3440', fg: '#eceff4', accent: '#88c0d0', cat: ['#bc74b0', '#769f4e', '#4881c4', '#b38a29', '#5096d6', '#ce7559', '#00a1c0', '#bf616a'] },
    light: { bg: '#eceff4', card: '#e5e9f0', fg: '#2e3440', accent: '#5e81ac', cat: ['#9a538c', '#a37b10', '#195f9c', '#c1684f', '#0090ae', '#a04650', '#4881c4', '#5c8f43'] },
  },
  {
    key: 'solarized', label: 'Solarized', note: 'Ethan Schoonover’s canonical light + dark pair',
    dark: { bg: '#002b36', card: '#073642', fg: '#eee8d5', accent: '#268bd2', cat: ['#268bd2', '#d35321', '#7075c8', '#889c0b', '#db3e89', '#b58901', '#008f86', '#e63e38'] },
    light: { bg: '#fdf6e3', card: '#eee8d5', fg: '#073642', accent: '#268bd2', cat: ['#7a8c00', '#6d72c5', '#cc4c18', '#2288cf', '#d43783', '#7f5f00', '#009289', '#c6121a'] },
  },
  {
    key: 'gruvbox', label: 'Gruvbox', note: 'warm retro groove, heavy on the earth tones',
    dark: { bg: '#282828', card: '#32302f', fg: '#ebdbb2', accent: '#83a598', cat: ['#c96c88', '#959800', '#b45e86', '#b88700', '#009499', '#de6c00', '#1ca27f', '#f94732'] },
    light: { bg: '#fbf1c7', card: '#f2e5bc', fg: '#3c3836', accent: '#076678', cat: ['#797400', '#8e3e70', '#b1720b', '#00879f', '#8d2b00', '#d45b08', '#9c0005', '#31905c'] },
  },
  {
    key: 'tokyonight', label: 'Tokyo Night', note: 'neon-on-navy; Day is the official light sibling',
    dark: { bg: '#1a1b26', card: '#24283b', fg: '#c0caf5', accent: '#7aa2f7', cat: ['#00a2ba', '#d2753a', '#678ee1', '#bb852e', '#369bd0', '#c34763', '#9d7cd6', '#74a13d'] },
    light: { bg: '#e1e2e7', card: '#d9dae3', fg: '#3760bf', accent: '#2e7de9', cat: ['#0084b0', '#804000', '#2978e4', '#527823', '#9854f1', '#9a6700', '#3861c0', '#ea195d'] },
  },
  {
    key: 'catppuccin', label: 'Catppuccin', note: 'pastel Mocha & Latte — soothing, high-comfort',
    dark: { bg: '#1e1e2e', card: '#313244', fg: '#cdd6f4', accent: '#89b4fa', cat: ['#be73ac', '#b18b28', '#6491da', '#c97a46', '#0088b2', '#62a35e', '#7f89d9', '#c46679'] },
    light: { bg: '#eff1f5', card: '#e6e9ef', fg: '#4c4f69', accent: '#1e66f5', cat: ['#d4133a', '#1d65f4', '#df5500', '#8839ef', '#36971f', '#95257d', '#b97200'] },
  },
  {
    key: 'rosepine', label: 'Rosé Pine', note: 'soho vibes for the terminal — Main & Dawn',
    dark: { bg: '#191724', card: '#1f1d2e', fg: '#e0def4', accent: '#c4a7e7', cat: ['#a27dcb', '#bb852e', '#008eb9', '#d07170', '#7464b3', '#dc6285', '#219eca', '#815ca8'] },
    light: { bg: '#faf4ed', card: '#fffaf3', fg: '#575279', accent: '#907aa9', cat: ['#007599', '#c77e00', '#0088b1', '#8d3636', '#a680ce', '#842e4b', '#0099ac'] },
  },
]

export const DEFAULT_THEME = 'graphite'
export const themeByKey = (k) => THEMES.find((t) => t.key === k) ?? THEMES[0]
