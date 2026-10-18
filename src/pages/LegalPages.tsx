import { Link } from 'react-router-dom';
import LegalPage, { Bullets, Fill, Section } from '@/components/legal/LegalPage';
import { BUSINESS } from '@/config/business';
import { Button } from '@/components/ui/button';
import { useConsent } from '@/contexts/ConsentContext';
import { useMarketplaceSettings, usePublicFinance } from '@/hooks/useMarketplace';
import { formatNaira } from '@/lib/format';

const B = BUSINESS;
const mail = <a href={`mailto:${B.email}`} className="text-primary hover:underline">{B.email}</a>;
const reviewNote = (
  <p>
    This page describes how {B.brand} works today. It is not legal advice. Items shown like <Fill label="example" /> are
    details the business still has to provide.
  </p>
);
// Only shown while the business details above are still empty, so a finished site shows no notice.
const draftNotice = !B.legalName ? reviewNote : null;

// ---------------------------------------------------------------- Privacy
export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      related={['/cookie-policy', '/terms', '/seller-agreement']}
      intro={<>
        <p>This policy explains what personal data {B.brand} collects, why, who it is shared with and the choices you have. It is written with the Nigeria Data Protection Act 2023 (NDPA) in mind.</p>
        {draftNotice}
      </>}
    >
      <Section title="1. Who we are">
        <p>
          {B.brand} runs the online marketplace at {B.website}. The company responsible for your personal data is{' '}
          <Fill value={B.legalName} label="registered company name" /> (registration no. <Fill value={B.registrationNumber} label="CAC number" />),
          {' '}{B.addressLines.join(' ')}. For anything about your data, write to {mail}.
        </p>
      </Section>
      <Section title="2. What we collect">
        <Bullets items={[
          <><strong className="text-foreground">Account details:</strong> name, email address, phone number, delivery address, city and state, and a password (handled by our sign-in provider; we never see it in plain text).</>,
          <><strong className="text-foreground">Seller details:</strong> business name, contact names, WhatsApp number, business address, product categories, logo, a verification document and bank account details used to pay you.</>,
          <><strong className="text-foreground">Orders and payments:</strong> what you ordered, amounts, delivery details and payment status and references. Card or bank details are entered on our payment partners' secure screens (Paystack, or Klump for Pay later) and are not stored by us.</>,
          <><strong className="text-foreground">Messages and content:</strong> chat messages, photos, videos and voice notes, inquiries, requests for quotation, quotes, support requests, disputes and anything you post.</>,
          <><strong className="text-foreground">Technical data:</strong> device, browser and IP address recorded by our hosting and service providers, and cookies or similar storage described in our <Link to="/cookie-policy" className="text-primary hover:underline">Cookie Policy</Link>.</>,
        ]} />
      </Section>
      <Section title="3. How we use it, and why">
        <Bullets items={[
          'To create your account, process orders and payments, and deliver the service you asked for (contract).',
          'To verify sellers, pay sellers and keep financial records (contract, legal obligation).',
          'To send you notices about your orders, messages, quotes, disputes and account (contract, legitimate interests).',
          'To answer support requests and resolve disputes (contract, legitimate interests).',
          'To keep the marketplace safe and prevent fraud and abuse (legitimate interests, legal obligation).',
          'To use optional analytics or marketing cookies, only if you allow them (consent).',
        ]} />
      </Section>
      <Section title="4. Who we share it with">
        <Bullets items={[
          <><strong className="text-foreground">Sellers</strong> receive what they need to fulfil your order (name, phone, delivery address, items). Buyers see a seller's store details.</>,
          <><strong className="text-foreground">Payment providers:</strong> Paystack for payments and seller payouts, and Klump for Pay later.</>,
          <><strong className="text-foreground">Infrastructure providers</strong> that host the site and store data (for example Supabase for the database, sign-in and file storage, and Vercel for hosting) and Cloudflare Stream for video delivery.</>,
          'Regulators, courts or law enforcement when the law requires it.',
          'A buyer of the business, if it is ever sold, under the same protections.',
        ]} />
        <p>We do not sell your personal data.</p>
      </Section>
      <Section title="5. Transfers outside Nigeria">
        <p>Some providers process data on servers outside Nigeria. Where that happens we rely on the safeguards the NDPA requires, such as contractual protections with those providers.</p>
      </Section>
      <Section title="6. How long we keep it">
        <p>We keep personal data for as long as we need it for the purposes above, including to meet tax, accounting and legal obligations, and for the time needed to deal with disputes and claims. After that we delete or anonymise it.</p>
      </Section>
      <Section title="7. Security">
        <p>
          Access to data is limited by role (buyer, seller, administrator) and enforced in the database. Connections are encrypted, and sellers' bank details and
          verification documents are kept in private storage that other users cannot read. No system is completely secure, so please use a strong password and keep it private.
        </p>
      </Section>
      <Section title="8. Your rights">
        <p>Under the NDPA you can ask us to give you a copy of your data, correct it, delete it, restrict or object to some uses, and move it to another service, and you can withdraw consent at any time. Write to {mail} and we will respond as the law requires. You can also complain to the Nigeria Data Protection Commission (NDPC).</p>
      </Section>
      <Section title="9. Children">
        <p>The marketplace is not meant for anyone under 18, and we do not knowingly collect their data. If you think a child has given us data, tell us and we will remove it.</p>
      </Section>
      <Section title="10. Changes">
        <p>If we change this policy we will update the date at the top and, for important changes, tell you in the app or by email.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Terms
export function TermsAndConditions() {
  return (
    <LegalPage
      title="Terms and Conditions"
      related={['/privacy-policy', '/returns-policy', '/shipping-policy', '/seller-agreement', '/dispute-resolution']}
      intro={<><p>By creating an account or using {B.website} you agree to these terms. Please read them with our other policies linked at the bottom of this page.</p>{draftNotice}</>}
    >
      <Section title="1. Who we are">
        <p>The marketplace is operated by <Fill value={B.legalName} label="registered company name" />, trading as {B.brand}, {B.addressLines.join(' ')}. Contact: {mail}, {B.phone}.</p>
      </Section>
      <Section title="2. Accounts">
        <Bullets items={[
          'You must be at least 18 and give accurate information.',
          'Keep your password private. You are responsible for what happens under your account.',
          'We may suspend or close an account that breaks these terms, is used for fraud, or puts others at risk.',
        ]} />
      </Section>
      <Section title="3. Our role">
        <p>
          {B.brand} provides the platform where independent sellers list products and buyers order them. Unless a listing says otherwise, the contract for the sale is between the buyer and the seller.
          We provide the marketplace, collect payments through our payment partners and release seller proceeds under the rules in the <Link to="/seller-agreement" className="text-primary hover:underline">Seller Agreement</Link>.
        </p>
      </Section>
      <Section title="4. Prices, minimum orders and orders">
        <Bullets items={[
          'Prices are in Nigerian naira. VAT of 7.5% is added at checkout and shown before you pay.',
          'Some products have a minimum order quantity (MOQ) and lower prices for larger quantities. The price for your quantity is calculated again by our system when you order.',
          'An order is confirmed when payment is confirmed. We may cancel an order that was priced wrongly, is out of stock, or looks fraudulent, and refund any payment you made.',
        ]} />
      </Section>
      <Section title="5. Payment">
        <p>Payments are processed by Paystack. Where offered, you can pay later through Klump, which is a separate service with its own approval and its own terms (see the <Link to="/bnpl-terms" className="text-primary hover:underline">BNPL Terms</Link>). Only payments made through our checkout are covered by our dispute process, so do not pay a seller outside the platform.</p>
      </Section>
      <Section title="6. Delivery, returns and cancellations">
        <p>See the <Link to="/shipping-policy" className="text-primary hover:underline">Shipping and Delivery Policy</Link>, the <Link to="/returns-policy" className="text-primary hover:underline">Return, Refund and Cancellation Policy</Link> and, for goods not yet available, the <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link>.</p>
      </Section>
      <Section title="7. Acceptable use">
        <p>You must not:</p>
        <Bullets items={[
          'list or buy illegal, counterfeit, stolen or dangerous goods, or anything the law does not allow to be sold;',
          'give false information, impersonate others or manipulate prices, reviews or ratings;',
          'harass others, send spam, or use messages and requests for quotation for anything other than genuine trade;',
          'try to avoid platform payments or fees, or to take buyers away from the checkout;',
          'attack, probe or overload the site, or use automated tools to copy it without permission.',
        ]} />
      </Section>
      <Section title="8. Content you post">
        <p>You keep ownership of what you post (listings, photos, videos, messages). You give us permission to store, display and distribute it as needed to run the marketplace. You are responsible for it and must have the right to post it. We may remove content that breaks these terms or the law.</p>
      </Section>
      <Section title="9. Intellectual property">
        <p>The {B.brand} name, logo, design and software belong to us or our licensors. These terms do not give you any rights to them.</p>
      </Section>
      <Section title="10. Third-party services">
        <p>The marketplace relies on services such as Paystack, Klump and Cloudflare Stream. They are run by other companies under their own terms, and we are not responsible for their services.</p>
      </Section>
      <Section title="11. Availability and changes">
        <p>We work to keep the site available but cannot promise it will always be uninterrupted or error free. We may change or stop features. We may update these terms; the date above shows the latest version, and continuing to use the site means you accept the update.</p>
      </Section>
      <Section title="12. Liability">
        <p>We are responsible for losses caused by our own breach of these terms or negligence to the extent the law allows. We are not responsible for sellers' goods, for events outside our reasonable control, or for indirect losses such as lost profit. Nothing in these terms limits any right you have under Nigerian consumer protection law, including the Federal Competition and Consumer Protection Act 2018, or any liability that cannot lawfully be limited.</p>
      </Section>
      <Section title="13. Governing law and disputes">
        <p>These terms are governed by {B.governingLaw}. Please try our <Link to="/dispute-resolution" className="text-primary hover:underline">dispute process</Link> first. This does not stop you going to a court or regulator.</p>
      </Section>
      <Section title="14. Contact">
        <p>Questions about these terms: {mail}, or use the <Link to="/contact" className="text-primary hover:underline">contact form</Link>.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Cookies
export function CookiePolicy() {
  const { openPreferences, consent } = useConsent();
  const rows: [string, string, string][] = [
    ['Sign-in session', 'Keeps you signed in (stored in your browser by our sign-in provider).', 'Until you sign out or it expires'],
    ['Inquiry basket', 'Remembers products you added to your inquiry basket on this device.', 'Until you clear it'],
    ['Theme', 'Remembers your light or dark choice.', 'Until you change it'],
    ['Your cookie choice', 'Remembers what you chose in the cookie banner.', 'Until you change it or the policy changes'],
    ['Payment services', 'Paystack and Klump load scripts so you can pay. Klump keeps a short-lived setting in your browser during Pay later checkout.', 'During checkout'],
    ['Video', 'Cloudflare Stream plays videos on the Watch page.', 'While watching'],
    ['Fonts', 'Text fonts are loaded from Google Fonts.', 'Per browser cache rules'],
  ];
  return (
    <LegalPage
      title="Cookie Policy"
      related={['/privacy-policy', '/terms']}
      intro={<p>Cookies and similar storage (such as your browser's local storage) are small pieces of data a website keeps on your device. This page lists what {B.brand} uses and how you stay in control.</p>}
    >
      <Section title="1. Essential (always on)">
        <p>These make the site work and cannot be switched off. They include keeping you signed in, security, secure checkout and remembering your choices here.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border border-border text-left text-xs">
            <thead className="bg-secondary text-foreground">
              <tr><th className="p-2">What</th><th className="p-2">Why</th><th className="p-2">How long</th></tr>
            </thead>
            <tbody>
              {rows.map(([what, why, how]) => (
                <tr key={what} className="border-t border-border align-top"><td className="p-2 font-medium text-foreground">{what}</td><td className="p-2">{why}</td><td className="p-2">{how}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="2. Analytics (optional)">
        <p>Analytics cookies would help us see how the site is used. We do not currently run any. If we add them, they will load only after you allow them.</p>
      </Section>
      <Section title="3. Marketing (optional)">
        <p>Marketing cookies would be used to show relevant offers and measure advertising. We do not currently run any. If we add them, they will load only after you allow them.</p>
      </Section>
      <Section title="4. Your choices">
        <p>You can change your choice at any time, and we will keep optional cookies off until you say yes.</p>
        <p>
          <Button onClick={openPreferences}>Change cookie settings</Button>
          {consent && <span className="ml-3 text-xs">Current choice: analytics {consent.analytics ? 'on' : 'off'}, marketing {consent.marketing ? 'on' : 'off'}.</span>}
        </p>
        <p>You can also delete or block cookies in your browser settings. Blocking essential storage may stop sign-in, the inquiry basket or checkout from working.</p>
      </Section>
      <Section title="5. Changes">
        <p>If we start using new cookies we will update this page and ask for your choice again where required.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Shipping
export function ShippingPolicy() {
  return (
    <LegalPage
      title="Shipping and Delivery Policy"
      related={['/returns-policy', '/preorder-policy', '/dispute-resolution', '/terms']}
      intro={<>{draftNotice}</>}
    >
      <Section title="1. Who delivers your order">
        <p>Orders are prepared and dispatched by the seller. {B.brand} does not hold the goods.</p>
      </Section>
      <Section title="2. Delivery cost and time">
        <p>
          The checkout total is the price of the goods plus 7.5% VAT; it does not add a separate delivery fee. Delivery charges, delivery areas and delivery times, where they apply, are set by each seller. Confirm them with the seller before you order, using
          <strong className="text-foreground"> Chat now</strong> or <strong className="text-foreground">Send inquiry</strong> on the product page. Delivery dates are estimates, not guarantees.
        </p>
        <p>Money you pay a seller outside our checkout (for example a delivery fee sent directly) is not covered by our dispute process.</p>
      </Section>
      <Section title="3. Following your order">
        <p>Your order moves through these steps, and you will get a notification at each change: <strong className="text-foreground">Paid, Processing, Shipped, Delivered</strong>. You can see the current step under <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>.</p>
      </Section>
      <Section title="4. Your delivery details">
        <p>Give a complete and correct address and a phone number the courier can reach. We and the seller are not responsible for late or failed delivery caused by wrong or incomplete details.</p>
      </Section>
      <Section title="5. Late or missing orders">
        <Bullets items={[
          'Message the seller first (Messages) and ask for an update.',
          <>If the delivery time stated on the listing or agreed with the seller has passed, open a dispute under <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>.</>,
          'We review the order and decide the outcome; see the Dispute Resolution Policy.',
        ]} />
      </Section>
      <Section title="6. Damaged or wrong items">
        <p>Check the goods when they arrive. If something is damaged, wrong or missing, take photos and report it as soon as you can through My orders. See the Return, Refund and Cancellation Policy.</p>
      </Section>
      <Section title="7. Preorders">
        <p>Goods ordered in advance ship after they become available. Dates and your rights if they change are in the <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link>.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Returns
export function ReturnsPolicy() {
  return (
    <LegalPage
      title="Return, Refund and Cancellation Policy"
      related={['/shipping-policy', '/preorder-policy', '/bnpl-terms', '/dispute-resolution']}
      intro={<>
        <p>This policy applies to orders paid through our checkout. Nothing in it limits rights you have under Nigerian consumer protection law, including the Federal Competition and Consumer Protection Act 2018.</p>
        {draftNotice}
      </>}
    >
      <Section title="1. Cancelling an order">
        <Bullets items={[
          <>Open <Link to="/my-orders" className="text-primary hover:underline">My orders</Link> and choose <strong className="text-foreground">Request cancellation</strong>. You can do this until the order is shipped.</>,
          'We review the request. If it is approved the order is cancelled and you are refunded.',
          'Once an order has shipped, use the return or refund steps below.',
        ]} />
      </Section>
      <Section title="2. Returns">
        <p>You can ask to return goods that arrive faulty, damaged, wrong or not as described. Report the problem within <Fill value={B.returnWindowDays} label="number of days" /> days of delivery, with photos where possible. Return the goods in the condition you received them, where that is reasonably possible.</p>
        <p>Returns because you changed your mind are available only where the seller's listing says so.</p>
      </Section>
      <Section title="3. Refunds">
        <Bullets items={[
          'Approved refunds go back to the way you paid: to your card or bank through Paystack, or through Klump for Pay later orders.',
          <>Refunds normally take about <Fill value={B.refundProcessingDays} label="number of working days" /> working days after approval; your bank may need longer.</>,
          'Delivery charges you paid to a seller outside our checkout are not refunded by us.',
          'For Pay later orders, how any instalments already paid are returned follows Klump\'s process. See the BNPL Terms.',
        ]} />
      </Section>
      <Section title="4. Asking for a refund">
        <p>Go to <Link to="/my-orders" className="text-primary hover:underline">My orders</Link> and choose <strong className="text-foreground">Request refund</strong> on a paid order, and tell us what went wrong. If you and the seller cannot agree, open a dispute from the same page.</p>
      </Section>
      <Section title="5. Preorders">
        <p>Special rules apply when the delivery date moves. See the <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link>.</p>
      </Section>
      <Section title="6. If we decline your request">
        <p>We will tell you why. You can open a dispute, contact us, or take your complaint to a consumer protection authority or a court.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Seller agreement
export function SellerAgreement() {
  return (
    <LegalPage
      title="Seller Agreement"
      related={['/terms', '/preorder-policy', '/bnpl-terms', '/dispute-resolution', '/privacy-policy']}
      intro={<><p>This agreement is between <Fill value={B.legalName} label="registered company name" /> ({B.brand}) and the business or person who opens a seller account. By applying or selling, you accept it together with the Terms and Conditions.</p>{draftNotice}</>}
    >
      <Section title="1. Becoming and staying a seller">
        <Bullets items={[
          'Applications are reviewed. We may ask for a verification document and bank details, and we approve or decline each store at our discretion.',
          'Your products may be listed only after your store is approved. We may remove a listing or suspend a store that breaks the rules.',
          'You must give accurate business information and keep it up to date.',
        ]} />
      </Section>
      <Section title="2. Listing rules">
        <Bullets items={[
          'List only goods you are allowed to sell and have, or can reliably obtain.',
          'Descriptions, photos, prices and minimum order quantities (MOQ) must be accurate. Show quantity prices clearly.',
          'State delivery areas, costs and times, and any return terms that apply, in the listing or in your replies to buyers.',
          'No illegal, counterfeit, stolen or unsafe goods. No misleading claims.',
        ]} />
      </Section>
      <Section title="3. Orders and delivery">
        <p>You must dispatch paid orders promptly, keep buyers informed through Messages, and deliver what was ordered. You are responsible for packaging and for goods until they reach the buyer.</p>
      </Section>
      <Section title="4. Commission and payouts">
        <Bullets items={[
          'We deduct a commission from each sale. The rate that applies to you is set by us and communicated to you.',
          'Your earnings for an order are held until the buyer has paid, the money has been received by us, the order is marked delivered and a hold period has passed.',
          'Payouts are made by bank transfer to the verified account on your store, above a minimum payout amount we set.',
          'If an order is cancelled or refunded, the related earnings are reversed. If you were already paid, the amount can be deducted from your next payout.',
          'You are responsible for your own taxes.',
        ]} />
      </Section>
      <Section title="5. Pay later (BNPL)">
        <p>You may switch on Pay later for products you want to offer that way, if we have enabled it. Whether a buyer is approved is decided by the provider, not by you or us. Depending on our settings, the Pay later fee may be carried by the platform, by the seller or by the customer; the setting that applies is shown to you in your dashboard and in the BNPL Terms. Funds from Pay later orders are released after delivery and after the provider has paid us.</p>
      </Section>
      <Section title="6. Preorders">
        <Bullets items={[
          'Preorders need our approval before they go live.',
          'Give an honest expected date and quantity. Do not take more preorders than you can fulfil.',
          'Tell us and your buyers if the date changes. Buyers may cancel and be refunded under the Preorder Policy.',
          'If you cannot fulfil a preorder, the buyer is refunded and the related earnings are reversed.',
        ]} />
      </Section>
      <Section title="7. Disputes">
        <p>You must respond to disputes promptly and in good faith. We may decide a dispute under the Dispute Resolution Policy, including ordering a refund.</p>
      </Section>
      <Section title="8. Customer data">
        <p>You may use a buyer's details only to fulfil their order and handle related support, and you must protect them. Do not share or sell them or use them for unrelated marketing.</p>
      </Section>
      <Section title="9. Ending this agreement">
        <p>You can close your store at any time after completing open orders. We may suspend or end it for breach, fraud, repeated complaints or legal reasons. Earnings that are due and not in dispute are still paid after closure, less any reversals.</p>
      </Section>
      <Section title="10. Liability and law">
        <p>You are responsible for your goods, listings and conduct. This agreement is governed by {B.governingLaw}.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- BNPL
export function BnplTerms() {
  const { data: finance } = usePublicFinance();
  const bearer = finance?.bnpl_fee_bearer;
  return (
    <LegalPage
      title="BNPL Terms and Conditions"
      related={['/returns-policy', '/terms', '/dispute-resolution']}
      intro={<><p>Pay later ("buy now, pay later") lets you split the cost of an eligible order into instalments. It is provided by <strong className="text-foreground">Klump</strong>, a separate company. {B.brand} is not the lender.</p>{draftNotice}</>}
    >
      <Section title="1. Who provides it">
        <p>Your application, approval, instalment plan and repayments are between you and Klump and are governed by Klump's terms. {B.brand} passes your order details to Klump so it can process the payment, and receives confirmation of the result.</p>
      </Section>
      <Section title="2. Who can use it">
        <Bullets items={[
          'You must be signed in and have a complete delivery address and phone number.',
          'Klump decides whether to approve you. Being shown the option is not a promise of approval.',
          'Pay later is only offered when every item in your cart was marked as eligible by its seller.',
          finance
            ? <>The order total (with VAT) must be between {formatNaira(Number(finance.bnpl_min_order))} and {formatNaira(Number(finance.bnpl_max_order))}.</>
            : 'The order total (with VAT) must be within the limits shown at checkout.',
          'There is a limit on how much you can have outstanding across Pay later orders at one time.',
          'Preorders cannot be paid for with Pay later.',
        ]} />
      </Section>
      <Section title="3. Cost">
        <p>
          {finance && Number(finance.bnpl_fee_percent) > 0
            ? <>A Pay later fee of {Number(finance.bnpl_fee_percent)}% of the order total applies. {bearer === 'customer' ? 'It is added to your total and shown before you confirm.' : bearer === 'supplier' ? 'It is covered by the seller and is not added to your total.' : 'It is covered by the marketplace and is not added to your total.'}</>
            : 'Any fee that applies to you is shown at checkout before you confirm.'}
          {' '}The number of instalments, their dates, amounts and any charges for late payment are set by Klump and shown to you when you apply.
        </p>
      </Section>
      <Section title="4. How checkout works">
        <Bullets items={[
          'Choose "Buy now, pay later with Klump" at checkout and review the order, VAT and any fee.',
          'We create your order and prepare the payment. Klump opens its own window where you apply, see your plan and confirm.',
          'We mark the order as paid only after our system has checked the result directly with Klump and the amount matches. You are told by notification.',
        ]} />
      </Section>
      <Section title="5. Your payment obligations">
        <p>By accepting a Klump plan you agree to repay it as Klump's terms require. Missed or late payments can have consequences set out by Klump. Read the plan before you confirm and keep your payments up to date.</p>
      </Section>
      <Section title="6. Failed, cancelled or refunded payments">
        <Bullets items={[
          'If the application is declined, abandoned or the payment fails, the order is not confirmed and you can try again or pay by card.',
          <>To cancel or return a Pay later order, use <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>. Refunds on Pay later orders are handled together with Klump, and how instalments already paid are returned depends on Klump's process.</>,
          'Questions about your plan or repayments go to Klump.',
        ]} />
      </Section>
      <Section title="7. Changes">
        <p>Pay later may be switched off, limited or changed at any time. Orders already confirmed are not affected.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Preorder
export function PreorderPolicy() {
  const { data: settings } = useMarketplaceSettings();
  const days = settings?.preorder_delay_cancel_days ?? 14;
  return (
    <LegalPage
      title="Preorder Policy"
      related={['/returns-policy', '/shipping-policy', '/seller-agreement', '/dispute-resolution']}
      intro={<><p>A preorder is an order for goods that are not yet in stock. You pay now and the seller delivers once the goods become available.</p>{draftNotice}</>}
    >
      <Section title="1. What you see">
        <p>Preorder products are clearly marked. Each one shows the expected availability date, an estimated delivery date where the seller has given one, any limit per order and how many places are left, and any terms set by the seller.</p>
      </Section>
      <Section title="2. Paying">
        <p>You pay the full price (plus VAT) when you order. Deposits and part-payments are not offered at the moment. Pay later is not available for preorders. Preorders must be placed in a separate order from in-stock items.</p>
      </Section>
      <Section title="3. Dates are estimates">
        <p>Expected dates are the seller's best estimate, not a guarantee. If a date changes you will get a notification, and the new date is shown on My orders.</p>
      </Section>
      <Section title="4. If the date moves later">
        <p>If the expected date moves more than <strong className="text-foreground">{days} days</strong> later than the date you ordered against, you can ask to cancel under <Link to="/my-orders" className="text-primary hover:underline">My orders</Link> and we will approve a full refund. You can ask to cancel at other times too, until the goods ship; those requests are reviewed under the Return, Refund and Cancellation Policy.</p>
      </Section>
      <Section title="5. If the seller cannot supply">
        <p>If a seller cannot fulfil a preorder, you are refunded in full.</p>
      </Section>
      <Section title="6. Availability and delivery">
        <p>When the goods are available the seller marks them ready and you are notified. Delivery then follows the Shipping and Delivery Policy and you can follow the order under My orders.</p>
      </Section>
      <Section title="7. Limits">
        <p>Sellers may limit the total number of places and how many you can order at once. We check these limits when you place the order.</p>
      </Section>
      <Section title="8. Problems">
        <p>If something goes wrong, contact the seller, then open a dispute under My orders. See the Dispute Resolution Policy.</p>
      </Section>
    </LegalPage>
  );
}

// ---------------------------------------------------------------- Disputes
export function DisputePolicy() {
  return (
    <LegalPage
      title="Dispute Resolution Policy"
      related={['/returns-policy', '/shipping-policy', '/terms', '/seller-agreement']}
      intro={<><p>If something goes wrong with an order, this is how we help buyers and sellers sort it out.</p>{draftNotice}</>}
    >
      <Section title="1. Talk to the seller first">
        <p>Most problems are solved by a message. Use <Link to="/messages" className="text-primary hover:underline">Messages</Link> and give the order details and photos where helpful.</p>
      </Section>
      <Section title="2. Open a dispute">
        <p>If you cannot agree, open a dispute from <Link to="/my-orders" className="text-primary hover:underline">My orders</Link>. You can do this for a paid order that was placed through our checkout. Choose the reason, say what outcome you want (refund, replacement or something else) and describe what happened.</p>
      </Section>
      <Section title="3. The seller responds">
        <p>The seller is notified and asked to respond. Sellers must reply promptly and honestly.</p>
      </Section>
      <Section title="4. We review">
        <p>We read both sides, may ask for more information such as photos, delivery proof or messages, and then decide. Our decision may be a full or partial refund, a replacement, or no action. We tell both of you through notifications.</p>
      </Section>
      <Section title="5. Carrying out the decision">
        <p>Refunds go back to the original payment method. Where a refund is ordered, the seller's related earnings are reversed or deducted from their next payout.</p>
      </Section>
      <Section title="6. Closing a dispute">
        <p>A buyer can withdraw a dispute at any time. A dispute is closed when it is resolved or withdrawn.</p>
      </Section>
      <Section title="7. Other ways to complain">
        <p>Using this process does not take away any legal rights. You can also contact a consumer protection authority or go to court. For complaints about the service itself, use our <Link to="/contact" className="text-primary hover:underline">contact form</Link>.</p>
      </Section>
    </LegalPage>
  );
}
