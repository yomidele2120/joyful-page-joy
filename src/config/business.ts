// Business details used across the legal pages, footer links and contact page.
// The first block comes from the existing site footer. The second block is information only the
// business owner knows: until it is filled in, the legal pages show a highlighted placeholder.
// Have a qualified Nigerian lawyer review the policy pages before relying on them.

export const BUSINESS = {
  brand: 'IT Hub Africa',
  website: 'www.ithubafrica.com',
  email: 'team@ithubafrica.com',
  phone: '+234 806 047 4393',
  phoneHref: 'tel:+2348060474393',
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
