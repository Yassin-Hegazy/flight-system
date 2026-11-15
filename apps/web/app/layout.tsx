import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Providers } from './providers';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'aeron. Fly more, worry less',
  description: 'Flight search, booking and ticketing',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* The header marks the current page from the URL, which on dynamic routes is only known
              at request time; the fallback keeps its height so the page does not jump. */}
          <Suspense fallback={<div className="h-[89px] xl:h-[107px]" />}>
            <SiteHeader />
          </Suspense>
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
