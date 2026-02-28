import Navbar from './Navbar';
import Footer from './Footer';
import WhatsAppButton from '@/components/WhatsAppButton';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
