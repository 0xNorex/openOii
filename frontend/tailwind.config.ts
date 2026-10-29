import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // —— Design Contract tokens ——
      // SSOT: app/styles/tokens.css。裸类直接解析到 token，
      // 因此禁止再写 text-[length:var(--text-sm)] / rounded-[var(--radius-md)] / z-[var(--z-popover)]。
      borderRadius: {
        DEFAULT: "var(--radius-sm)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        md: "var(--text-md)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
      },
      lineHeight: {
        tight: "var(--leading-tight)",
        snug: "var(--leading-snug)",
        normal: "var(--leading-normal)",
      },
      spacing: {
        0: "var(--space-0)",
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
      },
      zIndex: {
        panel: "var(--z-panel)",
        popover: "var(--z-popover)",
        toast: "var(--z-toast)",
        tooltip: "var(--z-tooltip)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      colors: {
        // Owned semantic palette; values live in styles/tokens.css.
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--color-primary-hover) / <alpha-value>)",
        "primary-pressed": "rgb(var(--color-primary-pressed) / <alpha-value>)",
        "primary-content": "rgb(var(--color-primary-content) / <alpha-value>)",
        neutral: "rgb(var(--color-neutral) / <alpha-value>)",
        "neutral-content": "rgb(var(--color-neutral-content) / <alpha-value>)",
        "paper-100": "rgb(var(--color-paper-100) / <alpha-value>)",
        "paper-200": "rgb(var(--color-paper-200) / <alpha-value>)",
        "paper-300": "rgb(var(--color-paper-300) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "border-strong": "rgb(var(--color-border-strong) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
        "info-content": "rgb(var(--color-info-content) / <alpha-value>)",
        // 状态文字只用 *-fg；*-bg 是同色低透明度底
        "info-fg": "rgb(var(--color-info) / <alpha-value>)",
        "info-bg": "rgb(var(--color-info) / var(--status-bg-alpha))",
        success: "rgb(var(--color-success) / <alpha-value>)",
        "success-content": "rgb(var(--color-success-content) / <alpha-value>)",
        // 状态文字只用 *-fg；*-bg 是同色低透明度底
        "success-fg": "rgb(var(--color-success) / <alpha-value>)",
        "success-bg": "rgb(var(--color-success) / var(--status-bg-alpha))",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        "warning-content": "rgb(var(--color-warning-content) / <alpha-value>)",
        // 状态文字只用 *-fg；*-bg 是同色低透明度底
        "warning-fg": "rgb(var(--color-warning) / <alpha-value>)",
        "warning-bg": "rgb(var(--color-warning) / var(--status-bg-alpha))",
        error: "rgb(var(--color-error) / <alpha-value>)",
        "error-content": "rgb(var(--color-error-content) / <alpha-value>)",
        // 状态文字只用 *-fg；*-bg 是同色低透明度底
        "error-fg": "rgb(var(--color-error) / <alpha-value>)",
        "error-bg": "rgb(var(--color-error) / var(--status-bg-alpha))",
        // 语义对比度令牌，按主题在 tokens.css 中取值（见 ADR 0002 注释）
        "ink-muted": "var(--ink-muted)",
        "ink-subtle": "var(--ink-subtle)",
        "ink-faint": "var(--ink-faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        dialog: "var(--shadow-dialog)",
        "tab-active": "inset 0 -3px 0 0 rgb(var(--color-primary))",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
      },
      width: {
        "panel-agent": "var(--panel-agent)",
        "panel-inspector": "var(--panel-inspector)",
      },
      maxWidth: {
        panel: "var(--panel-max)",
      },
      inset: {
        toolbar: "var(--toolbar-offset)",
      },
    },
  },
} satisfies Config;
