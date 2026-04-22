/**
 * tailwind.theme.ts — design-tokens.css 와 동일한 토큰을 Tailwind 형식으로 제공한다.
 *
 * 프로젝트별로 바꾸는 값: colors.primary 계열, fontFamily.heading/body.
 * 나머지 구조(토큰 이름, 스케일)는 프로젝트 간 동일하게 유지한다.
 *
 * 사용: 프로젝트 루트에 복사 후 tailwind.config.ts 에서 theme.extend 로 병합한다.
 *
 *   // tailwind.config.ts
 *   import type { Config } from 'tailwindcss';
 *   import { themeExtend } from './tailwind.theme';
 *
 *   export default {
 *     content: ['./app/**\/*.{ts,tsx}', './components/**\/*.{ts,tsx}'],
 *     theme: { extend: themeExtend },
 *     darkMode: 'class',
 *   } satisfies Config;
 */

import type { Config } from 'tailwindcss';

type ThemeExtend = NonNullable<NonNullable<Config['theme']>['extend']>;

export const themeExtend: ThemeExtend = {
  colors: {
    // ── Concept Color (프로젝트별 변경) ──
    primary: {
      DEFAULT: '#<HEX>',
      hover: '#<HEX>',
    },
    secondary: '#<HEX>',
    accent: '#<HEX>',

    // ── Semantic Colors (기본값 유지 권장) ──
    bg: '#FFFFFF',
    surface: '#F7F7F8',
    text: {
      DEFAULT: '#111827',
      muted: '#6B7280',
    },
    border: '#E5E7EB',
    success: '#16A34A',
    warning: '#EAB308',
    danger: '#DC2626',
    info: '#2563EB',
  },

  fontFamily: {
    heading: ['<heading font>', 'Inter', 'sans-serif'],
    body: ['<body font>', 'Inter', 'sans-serif'],
    mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
  },

  fontSize: {
    xs: ['12px', { lineHeight: '1.5' }],
    sm: ['14px', { lineHeight: '1.5' }],
    md: ['16px', { lineHeight: '1.5' }],
    lg: ['20px', { lineHeight: '1.2' }],
    xl: ['28px', { lineHeight: '1.2' }],
    '2xl': ['36px', { lineHeight: '1.2' }],
  },

  // 4px grid — Tailwind 기본 스케일을 유지/확장
  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    6: '24px',
    8: '32px',
    12: '48px',
    16: '64px',
  },

  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '16px',
    full: '9999px',
  },

  boxShadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 12px rgba(0, 0, 0, 0.10)',
    lg: '0 12px 32px rgba(0, 0, 0, 0.15)',
  },

  screens: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },

  zIndex: {
    base: '0',
    dropdown: '10',
    modal: '20',
    toast: '30',
  },
};
