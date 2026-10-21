import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import PrivacyPage from '@/app/privacy/page';
import TermsPage from '@/app/terms/page';
it('publishes operator, actual data flows, retention and Google limited-use disclosures', () => {
  const html = renderToStaticMarkup(createElement(PrivacyPage));
  for (const text of ['Victor', 'Indonesia', 'self-hosted', '30 days', '90 days', 'OpenAI', 'Anthropic', 'Limited Use', 'Disconnecting Gmail', 'mailto:hello@naspadstudio.id']) expect(html).toContain(text);
  expect(html).toContain('href="/terms"');
});
it('provides beta terms with ownership, AI review and mandatory-rights protections', () => {
  const html = renderToStaticMarkup(createElement(TermsPage));
  for (const text of ['Terms of Service', 'Victor', 'Indonesia', 'your content', 'AI', 'mandatory', 'mailto:hello@naspadstudio.id']) expect(html).toContain(text);
  expect(html).toContain('href="/privacy"');
});
