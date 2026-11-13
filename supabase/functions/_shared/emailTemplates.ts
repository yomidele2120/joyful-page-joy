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
    'vendor.payout_paid': 'Your supplier payout has been sent',
    'vendor.payout_issue': 'There is an update about your supplier payout',
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
    case 'vendor.payout_paid': heading = 'Payout sent'; intro = `A payout of ${money(data.amount, data.currency)} has been marked as paid.`; if (data.paymentReference) lines.push(`Transfer reference: ${data.paymentReference}`); actionPath = '/supplier-dashboard'; break;
    case 'vendor.payout_issue': heading = 'Payout needs attention'; intro = `A payout of ${money(data.amount, data.currency)} could not be completed.`; if (data.reason) lines.push(data.reason); actionPath = '/supplier-dashboard'; break;
    case 'buyer.dispute_update': heading = 'Dispute update'; intro = `Your dispute for ${order} is ${data.statusLabel ?? 'updated'}.`; actionPath = '/my-orders'; break;
    case 'vendor.dispute_update': heading = 'Dispute update'; intro = `A dispute for ${order} is ${data.statusLabel ?? 'updated'}.`; actionPath = '/supplier-dashboard'; break;
    case 'admin.dispute_opened': heading = 'New order dispute'; intro = `${order} has a new buyer dispute that needs review.`; actionPath = '/admin?tab=disputes'; break;
  }

  if (data.total !== undefined) lines.push(`Order total: ${money(data.total, data.currency)}`);
  if (data.paymentMethod) lines.push(`Payment method: ${data.paymentMethod}`);
  if (data.paymentReference) lines.push(`Transaction reference: ${data.paymentReference}`);
  if (data.reason && !eventType.includes('report')) lines.push(`Reason: ${data.reason}`);

  const items = data.items ?? [];
  const itemRows = items.map(item => {
    const name = item.href ? `<a href="${escapeHtml(item.href)}" style="color:#176b57;text-decoration:none">${escapeHtml(item.name)}</a>` : escapeHtml(item.name);
    const details = [item.quantity ? `Qty ${item.quantity}` : '', item.unitPrice !== undefined ? money(item.unitPrice, data.currency) : ''].filter(Boolean).join(' · ');
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e8eee9">${name}<div style="font-size:12px;color:#60736b">${escapeHtml(details)}</div></td></tr>`;
  }).join('');
  const details = lines.map(line => `<p style="margin:8px 0;color:#43564e">${escapeHtml(line)}</p>`).join('');
  const textItems = items.map(item => `- ${item.name}${item.quantity ? ` (qty ${item.quantity})` : ''}${item.unitPrice !== undefined ? `: ${money(item.unitPrice, data.currency)}` : ''}`).join('\n');
  const text = [heading, intro, ...lines, textItems, `${siteUrl}${actionPath}`].filter(Boolean).join('\n\n');
  return {
    subject: subjectFor(eventType, data),
    heading, intro, details, itemRows, actionUrl: `${siteUrl}${actionPath}`, text,
  };
}

export function renderNotificationEmail(eventType: string, data: NotificationEmailData, siteUrl: string): RenderedEmail {
  const base = siteUrl.replace(/\/$/, '');
  const content = contentFor(eventType, data, base);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f2f6f3;font-family:Arial,Helvetica,sans-serif;color:#20332d">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f3;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #dfe8e2;border-radius:8px;overflow:hidden">
<tr><td style="background:#176b57;padding:20px 28px;color:#fff;font-size:20px;font-weight:700">ITHUBAFRICA</td></tr>
<tr><td style="padding:30px 28px"><h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#20332d">${escapeHtml(content.heading)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#43564e">${escapeHtml(content.intro)}</p>
${content.itemRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 18px">${content.itemRows}</table>` : ''}
${content.details}
<p style="margin:26px 0"><a href="${escapeHtml(content.actionUrl)}" style="display:inline-block;background:#176b57;color:#fff;text-decoration:none;padding:12px 18px;border-radius:5px;font-weight:700">View details</a></p>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#708178">This is an automated notification from IT Hub Africa. For help, contact <a style="color:#176b57" href="mailto:team@ithubafrica.com">team@ithubafrica.com</a>.</p>
</td></tr></table><p style="font-size:11px;color:#819087">© IT Hub Africa</p></td></tr></table></body></html>`;
  return { subject: content.subject, html, text: content.text };
}

export function escapeEmailHtml(value: unknown): string { return escapeHtml(value); }
