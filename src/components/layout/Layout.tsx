import Navbar from './Navbar';
import Footer from './Footer';
import BottomNav from './BottomNav';
import ContactLauncher from '@/components/ContactLauncher';

// flushFooter: the page ends in a dark full-width section (like the home page's "Stay Updated"), so the footer sits
// directly against it with no gap. The room for the fixed mobile bottom nav then moves from the page into the footer.
export default function Layout({ children, flushFooter = false }: { children: React.ReactNode; flushFooter?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* pb-14 clears the fixed mobile bottom nav; desktop has none, so no padding needed there */}
      <main className={flushFooter ? 'flex-1' : 'flex-1 pb-14 md:pb-0'}>{children}</main>
      <Footer flush={flushFooter} />
      <ContactLauncher />
      <BottomNav />
    </div>
  );
}
