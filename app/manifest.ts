import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI Journal',
    short_name: 'Journal',
    description: 'Your private, honest AI journaling companion.',
    start_url: '/chat',
    display: 'standalone',
    background_color: '#0c0c0f',
    theme_color: '#7c6ef7',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
