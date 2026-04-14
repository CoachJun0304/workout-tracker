export const COLORS = {
  // Rose Gold palette
  roseGold: '#B76E79',
  roseGoldLight: '#D4A0A7',
  roseGoldDark: '#8B4E57',
  roseGoldFaint: '#B76E7915',
  roseGoldMid: '#B76E7930',

  // Black palette
  black: '#000000',
  darkBg: '#0D0D0D',
  darkCard: '#1A1A1A',
  darkCard2: '#222222',
  darkBorder: '#2A2A2A',
  darkBorder2: '#333333',

  // Text
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#AAAAAA',
  textMuted: '#666666',

  // Accents
  success: '#00C896',
  warning: '#FFB347',
  error: '#FF4B4B',
  purple: '#A78BFA',
  blue: '#60A5FA',

  // Gradients (use as array)
  gradientRose: ['#B76E79', '#8B4E57'],
  gradientDark: ['#1A1A1A', '#0D0D0D'],
  gradientCard: ['#222222', '#1A1A1A'],
};

export const FONTS = {
  regular: { fontFamily: 'System', fontWeight: '400' },
  medium: { fontFamily: 'System', fontWeight: '500' },
  semibold: { fontFamily: 'System', fontWeight: '600' },
  bold: { fontFamily: 'System', fontWeight: '700' },
  heavy: { fontFamily: 'System', fontWeight: '800' },
};

export const SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const SHADOWS = {
  roseGlow: {
    shadowColor: '#B76E79',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
};