import { describe, expect, it } from 'vitest';
import { trackingUrl } from './couriers';

describe('trackingUrl', () => {
  it('links couriers that have a public tracking page', () => {
    expect(trackingUrl('DHL Express', '123 456')).toBe('https://www.dhl.com/global-en/home/tracking.html?tracking-id=123%20456');
    expect(trackingUrl('fedex', 'ABC1')).toContain('trknbr=ABC1');
  });
  it('returns null when there is no known link or no waybill', () => {
    expect(trackingUrl('GIG Logistics', '7003419928')).toBeNull();
    expect(trackingUrl('DHL', '')).toBeNull();
    expect(trackingUrl(null, '1')).toBeNull();
  });
});
