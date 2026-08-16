const brands = [
  { name: 'Samsung', src: '/brands/samsung.svg' },
  { name: 'Apple', src: '/brands/apple.svg' },
  { name: 'Xiaomi', src: '/brands/xiaomi.svg' },
  { name: 'Infinix', src: '/brands/infinix.svg' },
  { name: 'Tecno', src: '/brands/tecno.svg' },
  { name: 'HP', src: '/brands/hp.svg' },
  { name: 'Dell', src: '/brands/dell.svg' },
  { name: 'Lenovo', src: '/brands/lenovo.svg' },
  { name: 'Acer', src: '/brands/acer.svg' },
  { name: 'ASUS', src: '/brands/asus.svg' },
  { name: 'MSI', src: '/brands/msi.svg' },
];

export default function BrandLogos() {
  return (
    <div className="w-full">
      <div className="mx-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-6 items-center justify-items-center max-w-5xl">
        {brands.map(b => (
          <div
            key={b.name}
            className="w-24 h-14 flex items-center justify-center grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all duration-300"
          >
            <img
              src={b.src}
              alt={b.name}
              loading="lazy"
              className="max-h-10 max-w-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
