import { MessageCircle } from 'lucide-react';

export default function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/2348060474393"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-6 md:bottom-6 z-40 w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="w-6 h-6 text-primary-foreground" />
    </a>
  );
}
