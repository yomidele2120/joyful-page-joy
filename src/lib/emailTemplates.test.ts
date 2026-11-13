import { describe, expect, it } from 'vitest';
import { renderNotificationEmail } from '../../supabase/functions/_shared/emailTemplates';

describe('notification email templates', () => {
  it('renders a branded order email with accurate details and a useful destination', () => {
    const email = renderNotificationEmail('buyer.order_paid', {
      orderNumber: 'A1B2C3D4',
      total: 12500,
      currency: 'NGN',
      paymentReference: 'itha_test_123',
      items: [{ name: 'Laptop', quantity: 1, unitPrice: 12500 }],
    }, 'https://www.ithubafrica.com/');

    expect(email.subject).toContain('A1B2C3D4');
    expect(email.html).toContain('ITHUBAFRICA');
    expect(email.html).toContain('Order confirmed');
    expect(email.html).toContain('Laptop');
    expect(email.html).toContain('itha_test_123');
    expect(email.html).toContain('https://www.ithubafrica.com/my-orders');
    expect(email.text).toContain('₦12,500');
  });

  it('escapes user-controlled content in HTML and still includes it in plain text', () => {
    const email = renderNotificationEmail('vendor.new_inquiry', {
      productName: '<script>alert(1)</script>',
      message: '<img src=x onerror=alert(1)>',
    }, 'https://www.ithubafrica.com');

    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.text).toContain('<img src=x onerror=alert(1)>');
  });
});
