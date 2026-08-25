import { describe, expect, it } from 'vitest';
import { parseLaunchFragment } from '../lib/telegram';

// The launch fragment is the only delivery of initData, platform and version;
// losing or mangling any of them either breaks auth or makes a current phone
// look like an ancient client.
describe('parseLaunchFragment', () => {
  it('keeps every tgWebApp field, decoded', () => {
    const parsed = parseLaunchFragment(
      '#tgWebAppData=query_id%3DAAH%26user%3D%257B%2522id%2522%253A1%257D&tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppThemeParams=%7B%7D',
    );
    expect(parsed.tgWebAppVersion).toBe('8.0');
    expect(parsed.tgWebAppPlatform).toBe('ios');
    expect(parsed.tgWebAppData).toContain('query_id=AAH');
    // Not a fixed whitelist: theme params matter to the SDK too.
    expect(parsed.tgWebAppThemeParams).toBe('{}');
  });

  it('ignores non-Telegram hash content', () => {
    expect(parseLaunchFragment('#/legacy-route?task=abc')).toEqual({});
    expect(parseLaunchFragment('')).toEqual({});
  });
});
