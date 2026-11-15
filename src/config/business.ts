// Business details used across the legal pages, footer links and contact page.
// The first block comes from the existing site footer. The second block is information only the
// business owner knows: until it is filled in, the legal pages show a highlighted placeholder.
// Have a qualified Nigerian lawyer review the policy pages before relying on them.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** { open, close } in 24-hour "HH:MM" (Lagos time), or null when closed that day. */
export type DayHours = { open: string; close: string } | null;
export type OpeningHours = Record<DayKey, DayHours>;

export const BUSINESS = {
  brand: 'IT Hub Africa',
  website: 'www.ithubafrica.com',
  email: 'team@ithubafrica.com',
  phone: '+234 806 047 4393',
  phoneHref: 'tel:+2348060474393',
  /** WhatsApp chat link (same number as the phone for now). */
  whatsappHref: 'https://wa.me/2348060474393',
  /** Numbers listed under "Call an agent". Add more as { display: '+234 ...', href: 'tel:+234...' }. */
  agentPhones: [{ display: '+234 806 047 4393', href: 'tel:+2348060474393' }] as { display: string; href: string }[],
  /** Text the map and the "Get directions" button search for. */
  mapQuery: 'Foramot Plaza, Somoye Osundairo, Oremeji, Computer Village, Ikeja, Lagos, Nigeria',
  /**
   * Opening hours (Lagos time). Leave as null to hide the "Open now" line and the hours table.
   * To show them, fill in every day, with null for a closed day, for example:
   *   { mon: { open: '09:00', close: '18:00' }, tue: { open: '09:00', close: '18:00' }, wed: ..., thu: ..., fri: ...,
   *     sat: { open: '10:00', close: '16:00' }, sun: null }
   */
  openingHours: null as OpeningHours | null,
  addressLines: [
    'Suite 108, Foramot Plaza, Somoye Osundairo,',
    'by Polaris Bank, Oremeji,',
    'Computer Village, Ikeja, Lagos',
  ],

  // ---- To be completed by the business owner ----
  /** Registered company name, e.g. "IT Hub Africa Limited". */
  legalName: '',
  /** CAC registration number. */
  registrationNumber: '',
  /** How many days a buyer has to ask for a return after delivery. */
  returnWindowDays: '',
  /** How many working days a refund normally takes once approved. */
  refundProcessingDays: '',

  // ---- Confirm with your lawyer ----
  governingLaw: 'the laws of the Federal Republic of Nigeria',
  /** Shown as "Last updated" on every policy page. Update it whenever you change a policy. */
  policiesLastUpdated: '17 October 2026',
};

export const LEGAL_LINKS: { to: string; label: string }[] = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms and Conditions' },
  { to: '/cookie-policy', label: 'Cookie Policy' },
  { to: '/shipping-policy', label: 'Shipping and Delivery Policy' },
  { to: '/returns-policy', label: 'Return, Refund and Cancellation Policy' },
  { to: '/seller-agreement', label: 'Seller Agreement' },
  { to: '/bnpl-terms', label: 'BNPL Terms and Conditions' },
  { to: '/preorder-policy', label: 'Preorder Policy' },
  { to: '/dispute-resolution', label: 'Dispute Resolution Policy' },
];

export const COMPANY_LINKS: { to: string; label: string }[] = [
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact Us' },
  { to: '/faq', label: 'FAQ' },
];
