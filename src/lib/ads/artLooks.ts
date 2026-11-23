// The looks a vendor can pick for an AI picture. The ids match ART_DIRECTIONS in supabase/functions/_shared/adBannerCore.ts;
// 'surprise' lets the server choose a different one each time.
export const ART_LOOKS: { id: string; label: string }[] = [
  { id: 'surprise', label: 'Surprise me (a new look each time)' },
  { id: 'clean', label: 'Clean photo' },
  { id: 'pedestal', label: 'Pedestal showcase' },
  { id: 'neon', label: 'Neon night' },
  { id: 'burst', label: 'Colour burst' },
  { id: 'papercut', label: 'Paper-cut layers' },
  { id: 'glass', label: 'Frosted glass' },
  { id: 'afro', label: 'African pattern' },
  { id: 'duotone', label: 'Duotone' },
  { id: 'flatlay', label: 'Flat-lay lifestyle' },
  { id: 'render3d', label: '3D render' },
  { id: 'sunset', label: 'Golden hour' },
  { id: 'abstract', label: 'Abstract motion' },
];
