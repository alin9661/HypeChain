/**
 * Unit tests for the first-party ThemeProvider (components/theme-provider.tsx)
 * Run with: npm test
 *
 * Covers the resolution matrix (light/dark/system x OS preference), localStorage
 * persistence with throw fallbacks, mount hydration, system matchMedia tracking
 * and cleanup, cross-tab storage sync, the useServerInsertedHTML once-guard, and
 * the top-header toggle flow. The pre-paint INIT_SCRIPT execution itself is
 * browser-only (SSR stream) and is covered by manual/E2E verification, not here.
 */

import React, { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useServerInsertedHTML } from 'next/navigation';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { TopHeader } from '@/components/top-header';

type MQListener = (e: { matches: boolean }) => void;

/**
 * Replaces the inert matchMedia mock from setup.ts with a controllable one:
 * flip the OS preference and fire 'change' events at will.
 */
function installMatchMedia(initialDark = false) {
  const listeners: MQListener[] = [];
  const mql = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: (_event: string, cb: MQListener) => {
      listeners.push(cb);
    },
    removeEventListener: (_event: string, cb: MQListener) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatchEvent: jest.fn(),
  };
  window.matchMedia = jest.fn().mockImplementation(() => mql) as any;
  return {
    setOSDark(dark: boolean) {
      mql.matches = dark;
    },
    fireChange(dark: boolean) {
      mql.matches = dark;
      listeners.forEach((cb) => cb({ matches: dark }));
    },
    listeners,
  };
}

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{String(theme)}</span>
      <button onClick={() => setTheme('light')}>to-light</button>
      <button onClick={() => setTheme('dark')}>to-dark</button>
      <button onClick={() => setTheme('system')}>to-system</button>
    </div>
  );
}

const renderProvider = (ui: React.ReactNode = <Probe />) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

const htmlClasses = () => document.documentElement.classList;

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.style.colorScheme = '';
    installMatchMedia(false);
  });

  describe('theme resolution (applyTheme matrix)', () => {
    it("applies 'light': light class, no dark class, colorScheme light", () => {
      renderProvider();
      fireEvent.click(screen.getByText('to-light'));
      expect(htmlClasses().contains('light')).toBe(true);
      expect(htmlClasses().contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it("applies 'dark': dark class, no light class, colorScheme dark", () => {
      renderProvider();
      fireEvent.click(screen.getByText('to-dark'));
      expect(htmlClasses().contains('dark')).toBe(true);
      expect(htmlClasses().contains('light')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it("resolves 'system' to dark when the OS prefers dark", () => {
      installMatchMedia(true);
      renderProvider();
      fireEvent.click(screen.getByText('to-system'));
      expect(htmlClasses().contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it("resolves 'system' to light when the OS prefers light", () => {
      installMatchMedia(false);
      renderProvider();
      fireEvent.click(screen.getByText('to-system'));
      expect(htmlClasses().contains('light')).toBe(true);
      expect(htmlClasses().contains('dark')).toBe(false);
    });
  });

  describe('stored preference hydration (readStoredTheme)', () => {
    it('hydrates a valid stored preference after mount', () => {
      window.localStorage.setItem('theme', 'dark');
      renderProvider();
      expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    });

    it("falls back to 'light' for a garbage stored value", () => {
      window.localStorage.setItem('theme', 'neon-vaporwave');
      renderProvider();
      expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    });

    it("falls back to 'light' when localStorage.getItem throws", () => {
      const spy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('storage blocked');
        });
      try {
        renderProvider();
        expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('setTheme persistence', () => {
    it("persists the preference to localStorage under 'theme'", () => {
      renderProvider();
      fireEvent.click(screen.getByText('to-dark'));
      expect(window.localStorage.getItem('theme')).toBe('dark');
      fireEvent.click(screen.getByText('to-system'));
      expect(window.localStorage.getItem('theme')).toBe('system');
    });

    it('still applies the theme for the session when setItem throws', () => {
      renderProvider();
      const spy = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('quota exceeded');
        });
      try {
        fireEvent.click(screen.getByText('to-dark'));
        expect(htmlClasses().contains('dark')).toBe(true);
        expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
      } finally {
        spy.mockRestore();
      }
      expect(window.localStorage.getItem('theme')).toBeNull();
    });
  });

  describe('system preference tracking', () => {
    it("re-resolves when the OS preference flips while pref is 'system'", () => {
      const mm = installMatchMedia(false);
      renderProvider();
      fireEvent.click(screen.getByText('to-system'));
      expect(htmlClasses().contains('light')).toBe(true);

      act(() => mm.fireChange(true));
      expect(htmlClasses().contains('dark')).toBe(true);

      act(() => mm.fireChange(false));
      expect(htmlClasses().contains('light')).toBe(true);
    });

    it("subscribes only while pref is 'system' and cleans up on unmount", () => {
      const mm = installMatchMedia(false);
      const { unmount } = renderProvider();

      // Default pref is 'light' — the system effect takes its early return.
      expect(mm.listeners).toHaveLength(0);
      fireEvent.click(screen.getByText('to-dark'));
      expect(mm.listeners).toHaveLength(0);

      fireEvent.click(screen.getByText('to-system'));
      expect(mm.listeners).toHaveLength(1);

      unmount();
      expect(mm.listeners).toHaveLength(0);
    });
  });

  describe('cross-tab sync (storage events)', () => {
    it("follows a 'theme' storage event from another tab", () => {
      renderProvider();
      window.localStorage.setItem('theme', 'dark');
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
      });
      expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
      expect(htmlClasses().contains('dark')).toBe(true);
    });

    it('ignores storage events for unrelated keys', () => {
      renderProvider();
      fireEvent.click(screen.getByText('to-dark'));
      window.localStorage.setItem('theme', 'light'); // would flip if applied
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'unrelated-key' })
        );
      });
      expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
      expect(htmlClasses().contains('dark')).toBe(true);
    });
  });

  describe('SSR script injection (useServerInsertedHTML once-guard)', () => {
    it('inserts the pre-paint script exactly once per provider instance', () => {
      renderProvider(<div />);
      const calls = (useServerInsertedHTML as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const insertCallback = calls[calls.length - 1][0];

      const first = insertCallback();
      expect(first).not.toBeNull();
      expect(first.type).toBe('script');
      expect(first.props.dangerouslySetInnerHTML.__html).toContain(
        "localStorage.getItem('theme')"
      );
      expect(first.props.dangerouslySetInnerHTML.__html).toContain(
        'prefers-color-scheme: dark'
      );

      // Second flush of the same provider instance must not duplicate.
      expect(insertCallback()).toBeNull();
    });
  });

  describe('top-header toggle flow', () => {
    it('Moon/Sun toggle flips between light and dark', async () => {
      renderProvider(<TopHeader />);
      const toggle = await screen.findByLabelText('Toggle theme');

      fireEvent.click(toggle);
      expect(htmlClasses().contains('dark')).toBe(true);
      expect(window.localStorage.getItem('theme')).toBe('dark');

      fireEvent.click(toggle);
      expect(htmlClasses().contains('light')).toBe(true);
      expect(window.localStorage.getItem('theme')).toBe('light');
    });
  });
});
