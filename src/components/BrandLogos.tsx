import React from 'react';

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
      <div className="mx-auto grid grid-cols-3 sm:grid-cols-6 gap-4 items-center justify-items-center max-w-4xl">
        {brands.map(b => (
          <div key={b.name} className="w-20 h-10 flex items-center justify-center">
            <img
              src={b.src}
              alt={b.name}
              loading="lazy"
              className="max-h-8 max-w-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
