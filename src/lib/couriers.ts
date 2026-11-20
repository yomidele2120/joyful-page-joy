// Couriers a supplier can pick, and where a buyer can follow a parcel.
// `track` is a public tracking page that accepts the waybill in the link. Couriers without one show the waybill with a
// copy button instead. To add a courier's link, add its name and its tracking URL here ({n} is replaced by the waybill).
export interface Courier { name: string; track?: string }

export const COURIERS: Courier[] = [
  { name: 'GIG Logistics' },
  { name: 'Kwik Delivery' },
  { name: 'Red Star Express' },
  { name: 'ABC Transport' },
  { name: 'God Is Good Motors' },
  { name: 'Sendbox' },
  { name: 'DHL', track: 'https://www.dhl.com/global-en/home/tracking.html?tracking-id={n}' },
  { name: 'UPS', track: 'https://www.ups.com/track?tracknum={n}' },
  { name: 'FedEx', track: 'https://www.fedex.com/fedextrack/?trknbr={n}' },
  { name: 'Aramex', track: 'https://www.aramex.com/track/results?ShipmentNumber={n}' },
  { name: 'Own delivery rider' },
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A link to the courier's own tracking page, or null when the courier has none we know of. */
export function trackingUrl(courier: string | null | undefined, waybill: string | null | undefined): string | null {
  if (!courier || !waybill) return null;
  const c = COURIERS.find(x => x.track && (key(courier) === key(x.name) || key(courier).includes(key(x.name))));
  return c?.track ? c.track.replace('{n}', encodeURIComponent(waybill.trim())) : null;
}
