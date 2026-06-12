/**
 * Jest test setup file
 * Configures test environment for React Testing Library
 */

import '@testing-library/jest-dom';

// jsdom does not provide TextEncoder/TextDecoder, which @solana/web3.js (via
// @noble/hashes) requires at import time. Polyfill from Node's util so modules
// that pull in web3.js (e.g. lib/anchor-client) are importable under jest.
import { TextEncoder, TextDecoder } from 'util';
if (typeof global.TextEncoder === 'undefined') {
  (global as any).TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  (global as any).TextDecoder = TextDecoder;
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  // No-op in jsdom: the real hook only emits during SSR streaming. Exposed as
  // a jest.fn so suites can grab the inserted-HTML callback and test it.
  useServerInsertedHTML: jest.fn(),
}));

// Mock window.matchMedia — guarded so suites that opt into the node
// environment can still run this shared setup file without crashing —
// e.g. landing-section-data.test.ts (DOM-free by design) and the web3.js
// transaction serialization tests (jsdom's Uint8Array realm breaks Buffer
// instanceof checks).
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Suppress console errors in tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
