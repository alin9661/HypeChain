/**
 * Unit tests for ApiClient base-URL resolution.
 *
 * The fallback (when NEXT_PUBLIC_API_URL is unset) is environment-dependent:
 *   - development: http://localhost:3001 (the local Express server)
 *   - production:  '' (same-origin) so the co-located Vercel Next.js API
 *     routes resolve instead of an unreachable localhost in the browser.
 * An explicit NEXT_PUBLIC_API_URL always wins and is normalized (trailing
 * slashes stripped).
 */

import ApiClient from '@/lib/api-client';

type MutableEnv = Record<string, string | undefined>;

describe('ApiClient base URL resolution', () => {
  const env = process.env as MutableEnv;
  const ORIGINAL_API_URL = env.NEXT_PUBLIC_API_URL;
  const ORIGINAL_NODE_ENV = env.NODE_ENV;

  afterEach(() => {
    env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
    env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('falls back to localhost:3001 in development when unset', () => {
    delete env.NEXT_PUBLIC_API_URL;
    env.NODE_ENV = 'development';
    expect(new ApiClient().getBaseURL()).toBe('http://localhost:3001');
  });

  it('falls back to same-origin ("") in production when unset', () => {
    delete env.NEXT_PUBLIC_API_URL;
    env.NODE_ENV = 'production';
    expect(new ApiClient().getBaseURL()).toBe('');
  });

  it('uses an explicit NEXT_PUBLIC_API_URL and strips trailing slashes', () => {
    env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';
    env.NODE_ENV = 'production';
    expect(new ApiClient().getBaseURL()).toBe('https://api.example.com');
  });
});
