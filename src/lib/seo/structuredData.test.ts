import { describe, it, expect } from 'vitest';
import { breadcrumbs, faqPage, nodeText, serialize, shopOrganization } from './structuredData';

describe('structured data', () => {
  it('turns JSX-like answers into the visible text', () => {
    const jsx = { props: { children: ['Go to ', { props: { children: 'My orders' } }, ' and choose Request.'] } };
    expect(nodeText(jsx)).toBe('Go to My orders and choose Request.');
    const f: any = faqPage([{ q: 'How?', a: jsx }, { q: '', a: 'x' }, { q: 'Empty', a: null }]);
    expect(f.mainEntity.length).toBe(1);
    expect(f.mainEntity[0].acceptedAnswer.text).toBe('Go to My orders and choose Request.');
    expect(faqPage([])).toBeNull();
  });
  it('builds a shop organization from real fields only', () => {
    const o: any = shopOrganization({ id: 'abc', store_name: 'Tech Hub', store_description: null, logo_url: 'http://x/y.png', location: 'Ikeja, Lagos' });
    expect(o.url).toBe('https://www.ithubafrica.com/shop/abc');
    expect(o.logo).toBeUndefined();
    expect(o.description).toBeUndefined();
    expect(o.address.addressLocality).toBe('Ikeja, Lagos');
    expect((shopOrganization({ id: 'a', store_name: 'S', logo_url: 'https://x/y.png' }) as any).logo).toBe('https://x/y.png');
  });
  it('numbers breadcrumbs and escapes script-closing text', () => {
    const b: any = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop/1' }]);
    expect(b.itemListElement[1].position).toBe(2);
    expect(serialize({ name: '</script><b>' })).not.toContain('</script>');
  });
});
