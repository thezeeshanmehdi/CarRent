import './globals.css';
export const metadata = { title: 'Car Rent Record', description: 'Rent car records, earning and expenses' };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f2933' };
export default function Root({ children }) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" /><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /></head><body>{children}</body></html>;
}
