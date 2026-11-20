import test from 'node:test';
import assert from 'node:assert/strict';
import { renderNotificationEmail } from './emailTemplates.ts';

const SITE = 'https://www.ithubafrica.com';
const TYPES = [
  'buyer.order_paid', 'vendor.order_received', 'buyer.order_processing', 'buyer.order_shipped', 'buyer.order_delivered',
  'buyer.order_cancelled', 'vendor.order_cancelled', 'buyer.refund_processed', 'buyer.refund_failed', 'buyer.payment_issue',
  'admin.payment_alert', 'vendor.new_inquiry', 'buyer.inquiry_replied', 'buyer.rfq_quote', 'vendor.new_rfq', 'admin.new_vendor',
  'admin.new_buyer', 'admin.content_report', 'user.support_reply', 'vendor.membership_activated', 'vendor.membership_expiring',
  'vendor.membership_payment_failed', 'vendor.payout_paid', 'vendor.payout_issue', 'buyer.dispute_update', 'vendor.dispute_update',
  'admin.dispute_opened', 'user.welcome', 'something.unknown',
];

test('every event type renders a complete, safe email', () => {
  for (const t of TYPES) {
    const e = renderNotificationEmail(t, { orderNumber: 'AB12CD34', total: 125000, currency: 'NGN', items: [{ name: 'Laptop <b>x</b>', quantity: 2, unitPrice: 50000 }] }, SITE);
    assert.ok(e.subject.length > 5, t);
    assert.match(e.html, /<!doctype html>/i, t);
    assert.match(e.html, /href="https:\/\/www\.ithubafrica\.com[^"]*"/, t);
    assert.doesNotMatch(e.html, /<b>x<\/b>/, `${t} must escape item names`);
    assert.match(e.html, /&lt;b&gt;x&lt;\/b&gt;/, t);
    assert.ok(e.text.includes('https://www.ithubafrica.com'), t);
  }
});

test('user supplied text cannot inject markup', () => {
  const e = renderNotificationEmail('vendor.new_inquiry', { message: '<script>alert(1)</script>', productName: '"><img src=x>' }, SITE);
  assert.doesNotMatch(e.html, /<script>alert/);
  assert.doesNotMatch(e.html, /"><img src=x>/);
});

test('label: value lines become rows and the call to action matches the audience', () => {
  const e = renderNotificationEmail('buyer.order_paid', { orderNumber: 'AB12', total: 5000, paymentMethod: 'Card' }, SITE);
  assert.match(e.html, /Order total/);
  assert.match(e.html, /View my order/);
  assert.match(renderNotificationEmail('admin.new_vendor', {}, SITE).html, /Open admin console/);
  assert.match(renderNotificationEmail('vendor.order_received', {}, SITE).html, /Open seller dashboard/);
});

test('cancelled and failed events use the warning colour, good news uses green', () => {
  assert.match(renderNotificationEmail('buyer.order_cancelled', {}, SITE).html, /#dc2626/);
  assert.match(renderNotificationEmail('buyer.order_shipped', {}, SITE).html, /#16a34a/);
});

test('the shipped email carries the supplier, courier and waybill, safely escaped', () => {
  const e = renderNotificationEmail('buyer.order_shipped', { orderNumber: 'AB12CD34', storeName: 'Techhub', courier: 'GIG <i>Logistics</i>', waybill: '7003419928' }, SITE);
  assert.match(e.text, /Techhub has shipped your items/);
  assert.match(e.text, /7003419928/);
  assert.doesNotMatch(e.html, /<i>Logistics<\/i>/);
});
