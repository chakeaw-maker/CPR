export const metadata = {
  title: 'CPR Recorder',
  description: 'ACLS-aligned real-time CPR event recorder',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
