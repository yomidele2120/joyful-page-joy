export interface EmailLineItem {
  name: string;
  quantity?: number;
  unitPrice?: number;
  href?: string;
}

export interface NotificationEmailData {
  orderNumber?: string;
  status?: string;
  total?: number;
  currency?: string;
  paymentReference?: string;
  paymentMethod?: string;
  storeName?: string;
  vendorName?: string;
  productName?: string;
  quantity?: number;
  message?: string;
  title?: string;
  description?: string;
  destination?: string;
  targetPrice?: number | null;
  unit?: string;
  unitPrice?: number;
  expiresAt?: string;
  daysLeft?: number;
  amount?: number;
  reason?: string;
  statusLabel?: string;
  items?: EmailLineItem[];
  actionPath?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (value: number | undefined, currency = 'NGN') => {
  if (value === undefined || !Number.isFinite(Number(value))) return '';
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value)); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
};

function subjectFor(eventType: string, data: NotificationEmailData): string {
  const order = data.orderNumber ? ` #${data.orderNumber}` : '';
  const subjects: Record<string, string> = {
    'buyer.order_paid': `Your order${order} is confirmed`,
    'vendor.order_received': `New paid order${order}`,
    'buyer.order_processing': `Your order${order} is being prepared`,
    'buyer.order_shipped': `Your order${order} has shipped`,
    'buyer.order_delivered': `Your order${order} was delivered`,
    'buyer.order_cancelled': `Your order${order} was cancelled`,
    'vendor.order_cancelled': `Order${order} was cancelled`,
    'buyer.refund_processed': `Your refund for order${order} was processed`,
    'buyer.refund_failed': `There is an update about your refund for order${order}`,
    'buyer.payment_issue': `Payment update for order${order}`,
    'admin.payment_alert': 'Marketplace payment needs attention',
    'vendor.new_inquiry': 'You received a new product inquiry',
    'buyer.inquiry_replied': 'A supplier replied to your inquiry',
    'buyer.rfq_quote': 'You received a quote for your request',
    'vendor.new_rfq': 'A new request for quotation matches your shop',
    'admin.new_vendor': 'A new vendor registered on IT Hub Africa',
    'admin.new_buyer': 'A new buyer registered on IT Hub Africa',
    'admin.content_report': 'A marketplace content report needs review',
    'user.support_reply': 'The IT Hub Africa support team replied',
    'vendor.membership_activated': 'Your supplier membership is active',
    'vendor.membership_expiring': 'Your supplier membership is expiring soon',
    'vendor.membership_payment_failed': 'Your supplier membership payment needs attention',
    'vendor.payout_paid': 'Your vendor payout has been sent',
    'vendor.payout_issue': 'There is an update about your vendor payout',
    'buyer.dispute_update': `An update to your dispute for order${order}`,
    'vendor.dispute_update': `An update to a dispute for order${order}`,
    'admin.dispute_opened': 'A new order dispute needs review',
  };
  return subjects[eventType] ?? 'An update from IT Hub Africa';
}

function contentFor(eventType: string, data: NotificationEmailData, siteUrl: string) {
  const order = data.orderNumber ? `Order #${data.orderNumber}` : 'Your order';
  const lines: string[] = [];
  let heading = 'Marketplace update';
  let intro = 'There is a new update from IT Hub Africa.';
  let actionPath = data.actionPath ?? '/';

  switch (eventType) {
    case 'buyer.order_paid':
      heading = 'Order confirmed'; intro = `${order} is confirmed and payment has been received.`; actionPath = '/my-orders'; break;
    case 'vendor.order_received':
      heading = 'New paid order'; intro = `${order} has been paid. Prepare the items below and update the order from your supplier dashboard.`; actionPath = '/supplier-dashboard'; break;
    case 'buyer.order_processing': heading = 'Being prepared'; intro = `${order} is being prepared by the supplier.`; actionPath = '/my-orders'; break;
    case 'buyer.order_shipped': heading = 'Your order has shipped'; intro = `${order} has been marked as shipped.`; actionPath = '/my-orders'; break;
    case 'buyer.order_delivered': heading = 'Order delivered'; intro = `${order} has been marked as delivered.`; actionPath = '/my-orders'; break;
    case 'buyer.order_cancelled':
    case 'vendor.order_cancelled': heading = 'Order cancelled'; intro = `${order} has been cancelled. Any applicable refund will be handled through the marketplace payment process.`; actionPath = eventType.startsWith('vendor.') ? '/supplier-dashboard' : '/my-orders'; break;
    case 'buyer.refund_processed': heading = 'Refund processed'; intro = `A refund of ${money(data.amount, data.currency)} for ${order} has been marked as processed.`; actionPath = '/my-orders'; break;
    case 'buyer.refund_failed': heading = 'Refund needs attention'; intro = `There was a problem processing the refund for ${order}. Our team is reviewing it.`; actionPath = '/my-orders'; break;
    case 'buyer.payment_issue': heading = 'Payment update'; intro = `Payment for ${order} is ${data.statusLabel ?? 'under review'}. Your order is not confirmed until the payment is verified.`; actionPath = '/my-orders'; break;
    case 'admin.payment_alert': heading = 'Payment review required'; intro = `A payment for ${order} has status ${data.statusLabel ?? 'review required'}. Please review the transaction in the admin console.`; actionPath = '/admin?tab=payments'; break;
    case 'vendor.new_inquiry': heading = 'New product inquiry'; intro = `${data.productName ? `A buyer asked about ${data.productName}.` : 'A buyer sent your shop an inquiry.'}`; if (data.message) lines.push(data.message); actionPath = '/inquiries'; break;
    case 'buyer.inquiry_replied': heading = 'Supplier replied'; intro = `${data.storeName ?? 'A supplier'} replied to your inquiry${data.productName ? ` about ${data.productName}` : ''}.`; if (data.message) lines.push(data.message); actionPath = '/messages'; break;
    case 'buyer.rfq_quote': heading = 'You received a quote'; intro = `${data.storeName ?? 'A supplier'} sent a quote for “${data.title ?? 'your request'}”.`; if (data.unitPrice !== undefined) lines.push(`Unit price: ${money(data.unitPrice)}`); if (data.quantity) lines.push(`Minimum quantity: ${data.quantity} ${data.unit ?? 'Piece'}`); if (data.message) lines.push(data.message); actionPath = '/rfq'; break;
    case 'vendor.new_rfq': heading = 'New matching request'; intro = `A buyer posted a request that matches ${data.storeName ?? 'your shop'}${data.title ? `: ${data.title}` : ''}.`; if (data.description) lines.push(data.description); if (data.quantity) lines.push(`Quantity: ${data.quantity} ${data.unit ?? 'Piece'}`); if (data.destination) lines.push(`Destination: ${data.destination}`); if (data.targetPrice != null) lines.push(`Target price: ${money(data.targetPrice)}`); actionPath = '/rfq'; break;
    case 'admin.new_vendor': heading = 'New vendor registration'; intro = `${data.storeName ?? 'A new vendor'} has registered and may need review.`; actionPath = '/admin?tab=suppliers'; break;
    case 'admin.new_buyer': heading = 'New buyer registration'; intro = 'A new buyer account was created.'; actionPath = '/admin?tab=users'; break;
    case 'admin.content_report': heading = 'Reported marketplace content'; intro = `A user submitted a report${data.reason ? `: ${data.reason}` : ''}. Review it in the admin moderation queue.`; actionPath = '/admin?tab=moderation'; break;
    case 'user.support_reply': heading = 'Support replied'; intro = `Our support team replied${data.title ? ` to “${data.title}”` : ' to your request'}.`; if (data.message) lines.push(data.message); actionPath = '/contact'; break;
    case 'vendor.membership_activated': heading = 'Membership activated'; intro = `Your ${data.statusLabel ?? 'paid'} supplier membership is active${data.expiresAt ? ` until ${new Date(data.expiresAt).toLocaleDateString('en-NG')}` : ''}.`; actionPath = '/supplier-dashboard?tab=membership'; break;
    case 'vendor.membership_expiring': heading = 'Membership expiring soon'; intro = `Your ${data.statusLabel ?? 'supplier'} membership expires in ${data.daysLeft ?? 'a few'} day(s).`; if (data.expiresAt) lines.push(`Expiry date: ${new Date(data.expiresAt).toLocaleDateString('en-NG')}`); actionPath = '/supplier-dashboard?tab=membership'; break;
    case 'vendor.membership_payment_failed': heading = 'Membership payment not confirmed'; intro = `We could not confirm payment for your ${data.statusLabel ?? 'supplier'} membership. Your plan has not been upgraded.`; actionPath = '/supplier-dashboard?tab=membership'; break;
    case 'vendor.payout_paid': heading = 'Payout sent'; intro = `A payout of ${money(data.amount)} has been marked as sent to your verified account.`; actionPath = '/supplier-dashboard'; break;
    case 'vendor.payout_issue': heading = 'Payout needs attention'; intro = `A payout of ${money(data.amount)} is ${data.statusLabel ?? 'under review'}.`; if (data.reason) lines.push(data.reason); actionPath = '/supplier-dashboard'; break;
    case 'buyer.dispute_update': heading = 'Dispute update'; intro = `Your dispute for ${order} is ${data.statusLabel ?? 'updated'}.`; actionPath = '/my-orders'; break;
    case 'vendor.dispute_update': heading = 'Dispute update'; intro = `A dispute for ${order} is ${data.statusLabel ?? 'updated'}.`; actionPath = '/supplier-dashboard'; break;
    case 'admin.dispute_opened': heading = 'New order dispute'; intro = `${order} has a new buyer dispute that needs review.`; actionPath = '/admin?tab=disputes'; break;
  }

  if (data.total !== undefined) lines.push(`Order total: ${money(data.total, data.currency)}`);
  if (data.paymentMethod) lines.push(`Payment method: ${data.paymentMethod}`);
  if (data.paymentReference) lines.push(`Transaction reference: ${data.paymentReference}`);
  if (data.reason && !eventType.includes('report')) lines.push(`Reason: ${data.reason}`);

  const items = data.items ?? [];
  const textItems = items.map(item => `- ${item.name}${item.quantity ? ` (qty ${item.quantity})` : ''}${item.unitPrice !== undefined ? `: ${money(item.unitPrice, data.currency)}` : ''}`).join('\n');
  const text = [heading, intro, ...lines, textItems, `${siteUrl}${actionPath}`].filter(Boolean).join('\n\n');
  return {
    subject: subjectFor(eventType, data),
    heading, intro, lines, items, currency: data.currency, tone: toneFor(eventType), cta: ctaFor(eventType),
    actionUrl: `${siteUrl}${actionPath}`, text,
  };
}

type Tone = 'good' | 'attention' | 'bad' | 'info';
const TONES: Record<Tone, { bar: string; chipBg: string; chipFg: string; label: string }> = {
  good: { bar: '#16a34a', chipBg: '#e7f6ec', chipFg: '#14532d', label: 'Good news' },
  attention: { bar: '#e8590c', chipBg: '#fff1e6', chipFg: '#9a3a05', label: 'Needs attention' },
  bad: { bar: '#dc2626', chipBg: '#fdecec', chipFg: '#7f1d1d', label: 'Cancelled or failed' },
  info: { bar: '#2563eb', chipBg: '#e8f0fe', chipFg: '#1e3a8a', label: 'Update' },
};
function toneFor(eventType: string): Tone {
  if (/cancelled|payment_failed|refund_failed/.test(eventType)) return 'bad';
  if (/payment_issue|payment_alert|expiring|payout_issue|dispute|content_report/.test(eventType)) return 'attention';
  if (/order_paid|order_received|shipped|delivered|refund_processed|membership_activated|payout_paid|rfq_quote|inquiry_replied|support_reply/.test(eventType)) return 'good';
  return 'info';
}
function ctaFor(eventType: string): string {
  if (/^buyer\.(order|refund|payment|dispute)/.test(eventType)) return 'View my order';
  if (eventType === 'vendor.order_received' || eventType === 'vendor.order_cancelled') return 'Open seller dashboard';
  if (eventType.startsWith('admin.')) return 'Open admin console';
  if (eventType === 'buyer.rfq_quote') return 'View the quote';
  if (eventType === 'vendor.new_rfq') return 'View the request';
  if (/inquiry|support_reply/.test(eventType)) return 'Read and reply';
  if (eventType.startsWith('vendor.membership')) return 'Manage membership';
  if (eventType.startsWith('vendor.')) return 'Open seller dashboard';
  return 'View details';
}

export function renderNotificationEmail(eventType: string, data: NotificationEmailData, siteUrl: string): RenderedEmail {
  const base = siteUrl.replace(/\/$/, '');
  const c = contentFor(eventType, data, base);
  const tone = TONES[c.tone];
  const NAVY = '#0a2236';
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  // "Label: value" lines become a tidy two-column list; anything else stays a paragraph.
  const rows: string[] = [];
  const paras: string[] = [];
  for (const line of c.lines) {
    const m = /^([^:]{2,32}):\s+(.+)$/.exec(line);
    if (m) rows.push(`<tr><td style="padding:9px 0;border-bottom:1px solid #e6ebf1;font-size:13px;color:#64748b;width:42%;vertical-align:top">${escapeHtml(m[1])}</td><td style="padding:9px 0;border-bottom:1px solid #e6ebf1;font-size:14px;color:${NAVY};font-weight:600;text-align:right;vertical-align:top">${escapeHtml(m[2])}</td></tr>`);
    else paras.push(`<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(line)}</p>`);
  }
  const itemRows = c.items.map(item => {
    const name = item.href ? `<a href="${escapeHtml(item.href)}" style="color:${NAVY};text-decoration:none;font-weight:600">${escapeHtml(item.name)}</a>` : `<span style="font-weight:600;color:${NAVY}">${escapeHtml(item.name)}</span>`;
    const qty = item.quantity ? `<div style="font-size:12px;color:#64748b;margin-top:2px">Quantity ${escapeHtml(item.quantity)}</div>` : '';
    const price = item.unitPrice !== undefined ? escapeHtml(money(item.unitPrice, c.currency)) + (item.quantity && item.quantity > 1 ? '<div style="font-size:12px;color:#64748b">each</div>' : '') : '';
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #e6ebf1;font-size:14px;line-height:1.4">${name}${qty}</td><td style="padding:12px 0;border-bottom:1px solid #e6ebf1;font-size:14px;color:${NAVY};text-align:right;white-space:nowrap;vertical-align:top">${price}</td></tr>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:${font};color:#0f172a;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(c.intro)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%">
<tr><td style="background:${NAVY};border-radius:16px 16px 0 0;padding:18px 24px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
    <td><a href="${escapeHtml(base)}" style="text-decoration:none"><span style="display:inline-block;background:#ffffff;border-radius:10px;padding:7px 12px"><img src="${escapeHtml(base)}/email/logo.png" alt="IT Hub Africa" height="26" style="display:block;height:26px;width:auto;border:0;font-family:${font};font-size:15px;font-weight:700;color:${NAVY}"></span></a></td>
    <td align="right" style="font-size:12px;color:#9fb3c8">ithubafrica.com</td>
  </tr></table>
</td></tr>
<tr><td style="background:${tone.bar};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 8px">
  <span style="display:inline-block;background:${tone.chipBg};color:${tone.chipFg};font-size:12px;font-weight:700;border-radius:999px;padding:5px 12px">${escapeHtml(c.heading)}</span>
  <p style="margin:16px 0 0;font-size:22px;line-height:1.35;font-weight:700;color:${NAVY}">${escapeHtml(c.intro)}</p>
</td></tr>
<tr><td style="background:#ffffff;padding:8px 28px 0">
  ${itemRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 6px">${itemRows}</table>` : ''}
  ${paras.length ? `<div style="margin-top:14px">${paras.join('')}</div>` : ''}
  ${rows.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:10px 0 4px">${rows.join('')}</table>` : ''}
</td></tr>
<tr><td style="background:#ffffff;padding:22px 28px 32px">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#e8590c;border-radius:12px">
    <a href="${escapeHtml(c.actionUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(c.cta)}</a>
  </td></tr></table>
  <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#64748b">Button not working? Copy this link into your browser:<br><a href="${escapeHtml(c.actionUrl)}" style="color:#1d4ed8;word-break:break-all">${escapeHtml(c.actionUrl)}</a></p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e6ebf1;border-radius:0 0 16px 16px;padding:20px 28px">
  <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#64748b">You are getting this email because of activity on your IT Hub Africa account. It is sent automatically, so please do not reply to it.</p>
  <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">Need help? Write to <a href="mailto:team@ithubafrica.com" style="color:#1d4ed8">team@ithubafrica.com</a> or visit <a href="${escapeHtml(base)}" style="color:#1d4ed8">${escapeHtml(base.replace(/^https?:\/\//, ''))}</a>.</p>
</td></tr>
</table>
<p style="margin:14px 0 0;font-size:11px;color:#94a3b8">© IT Hub Africa</p>
</td></tr></table></body></html>`;
  return { subject: c.subject, html, text: c.text };
}

export function escapeEmailHtml(value: unknown): string { return escapeHtml(value); }
