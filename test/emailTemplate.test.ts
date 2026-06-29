import { describe, it, expect } from 'vitest';
import { buildWeeklyDigestHtml, type DigestCard } from '../lib/emailTemplate';

const card = (over: Partial<DigestCard> = {}): DigestCard => ({
  url: 'https://united24media.com/defense-tech/some-article-19647',
  title: 'A Russian Drone That Takes Off Every Minute',
  lead: 'Molniya drones can fly up to 30 kilometers.',
  cover: 'https://storage.united24media.com/thumbs/1200x630/cover.jpg',
  authorName: 'Illia Kabachynskyi',
  authorRole: 'Feature Writer',
  authorPhoto: 'https://storage.united24media.com/thumbs/100x100/author.jpg',
  authorUrl: 'https://united24media.com/authors/kabachynskyi',
  section: 'Defense Tech',
  ...over,
});

describe('buildWeeklyDigestHtml', () => {
  it('produces a full HTML document with the canonical head + footer', () => {
    const html = buildWeeklyDigestHtml({ intro: 'Hello world', campaignTag: 'weekly_20', cards: [card()] });
    expect(html.startsWith('<html')).toBe(true);
    expect(html).toContain('UNITED24 Media weekly'.split(' ')[0]); // sanity: brand present
    expect(html).toContain('Support UNITED24 Media Team'); // static support block
    expect(html).toContain('{{unsubscribe_url}}'); // SendPulse unsubscribe placeholder preserved
    expect(html).toContain('href="https://united24media.com/donate"');
  });

  it('renders one card block per article with cover, author and READ MORE', () => {
    const html = buildWeeklyDigestHtml({
      intro: 'x',
      campaignTag: 'weekly_20',
      cards: [card(), card({ title: 'Second piece', authorName: 'Olena Blizniakova' })],
    });
    expect((html.match(/READ MORE/g) || []).length).toBe(2);
    expect(html).toContain('https://storage.united24media.com/thumbs/1200x630/cover.jpg');
    expect(html).toContain('ILLIA KABACHYNSKYI'); // author name uppercased
    expect(html).toContain('OLENA BLIZNIAKOVA');
    expect(html).toContain('Feature Writer');
  });

  it('puts the campaign tag into header / intro / ALL NEWS utm only', () => {
    const html = buildWeeklyDigestHtml({ intro: 'x', campaignTag: 'weekly_42', cards: [card()] });
    expect(html).toContain('utm_campaign=weekly_42');
    expect(html).toContain(
      'href="https://united24media.com/news?utm_source=sendpulse&amp;utm_medium=email&amp;utm_campaign=weekly_42"',
    );
    // Article card link stays raw (no utm), matching the source template
    expect(html).toContain('href="https://united24media.com/defense-tech/some-article-19647"');
  });

  it('escapes HTML in user-provided text to avoid breaking markup', () => {
    const html = buildWeeklyDigestHtml({
      intro: 'Tom & Jerry <script>alert(1)</script>',
      campaignTag: 'weekly_1',
      cards: [card({ title: 'A "quoted" & <tagged> title' })],
    });
    expect(html).toContain('Tom &amp; Jerry &lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('A "quoted" &amp; &lt;tagged&gt; title');
  });

  it('keeps line breaks in the intro as <br>', () => {
    const html = buildWeeklyDigestHtml({ intro: 'Line one\nLine two', campaignTag: 'w', cards: [card()] });
    expect(html).toContain('Line one<br>Line two');
  });
});
