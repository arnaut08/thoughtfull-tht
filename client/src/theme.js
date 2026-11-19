import { createTheme } from '@mui/material/styles';
import { tokens as t } from './styles/tokens';

const focusRing = `0 0 0 2px ${t.bg}, 0 0 0 4px ${t.primary}`;

const headings = { fontFamily: t.fontHeading, fontWeight: 700, lineHeight: 1.2 };

export const theme = createTheme({
  palette: {
    primary: { main: t.primary, dark: t.primaryHover, contrastText: t.onPrimary },
    secondary: { main: t.accent, contrastText: t.onAccent },
    surface: { main: t.surface },
    background: { default: t.bg, paper: t.bg },
    text: { primary: t.text, secondary: t.muted },
    divider: t.border,
    error: { main: t.danger },
    warning: { main: t.warning },
    success: { main: t.success },
  },
  shape: { borderRadius: t.radiusCard },
  typography: {
    fontFamily: t.fontBody,
    h1: { ...headings, fontSize: 'clamp(2rem, 4vw, 3rem)' },
    h2: { ...headings, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' },
    h3: { ...headings, fontSize: '1.5rem' },
    h4: { ...headings, fontSize: '1.25rem' },
    h5: { ...headings, fontSize: '1.125rem' },
    h6: { ...headings, fontSize: '1rem' },
    button: { fontFamily: t.fontHeading, fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: t.radiusButton,
          padding: '8px 22px',
          '&.Mui-focusVisible': { boxShadow: focusRing },
        },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderColor: t.border, borderRadius: t.radiusCard } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: t.radiusCard,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: t.inputBorder } },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          gap: 8,
          '& .MuiToggleButtonGroup-grouped, & .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
            marginLeft: 0,
            borderLeft: `1px solid ${t.inputBorder}`,
            borderRadius: t.radiusButton,
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: t.radiusButton,
          border: `1px solid ${t.inputBorder}`,
          padding: '8px 20px',
          textTransform: 'none',
          fontWeight: 600,
          color: theme.palette.text.primary,
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            borderColor: theme.palette.primary.main,
          },
        }),
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: t.radiusCard } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 12 } } },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: { root: { backgroundColor: t.bg, borderBottom: `1px solid ${t.border}` } },
    },
  }
});