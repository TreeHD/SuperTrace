import {StyleSheet} from 'react-native';

export const Colors = {
  background: '#0A0E1A',
  surface: '#141929',
  surfaceLight: '#1C2237',
  surfaceBorder: '#252B45',
  primary: '#6C63FF',
  primaryDark: '#5549E0',
  primaryLight: '#8B84FF',
  accent: '#00D9FF',
  accentDark: '#00B8D9',
  success: '#00E676',
  successDark: '#00C853',
  warning: '#FFD740',
  warningDark: '#FFC400',
  error: '#FF5252',
  errorDark: '#FF1744',
  text: '#E8EAED',
  textSecondary: '#9AA0B8',
  textMuted: '#636A85',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  cardGlow: 'rgba(108, 99, 255, 0.08)',
  hopActive: 'rgba(0, 217, 255, 0.15)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  round: 999,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  title: 34,
};

export const FontFamily = {
  mono: 'monospace',
};

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const CommonStyles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.xxl,
    width: '90%',
    maxWidth: 420,
    ...Shadow.modal,
  },
  buttonPrimary: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '600' as const,
  },
  monoText: {
    fontFamily: FontFamily.mono,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: Spacing.md,
  },
});
