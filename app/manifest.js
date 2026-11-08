export default function manifest() {
  return {
    name: 'CarRent by Zee Technologies',
    short_name: 'CarRent',
    description: 'Smart car rental records, earnings and expense logbook',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a2f3d',
    theme_color: '#0a2f3d',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}

