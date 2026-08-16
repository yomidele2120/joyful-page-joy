import Navbar from './Navbar';
import Footer from './Footer';
import BottomNav from './BottomNav';
import WhatsAppButton from '@/components/WhatsAppButton';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* pb-14 clears the fixed mobile bottom nav; desktop has none, so no padding needed there */}
      <main className="flex-1 pb-14 md:pb-0">{children}</main>
      <Footer />
      <WhatsAppButton />
      <BottomNav />
    </div>
  );
}
