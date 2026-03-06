import './globals.css';
import { ReactNode } from 'react';
import Providers from './providers';
import SidebarNav from './SidebarNav';
import { SidebarChampions } from '../components/sidebar-champions/SidebarChampions';
import { CouponPanel } from '../components/coupon-panel/CouponPanel';
import { FixtureDetailPanel } from '../components/fixture-detail-panel/FixtureDetailPanel';
import { DateBar } from '../components/date-bar/DateBar';

export const metadata = {
  title: 'API SCORE | Command Center',
  description: 'Plateforme de paris football live orientée décision rapide',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <div className="app-shell">
            {/* ── Sidebar gauche ── */}
            <aside className="sidebar">
              <div className="sidebar-brand">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="sidebar-brand-icon">
                  <circle cx="10" cy="10" r="9" stroke="#29b6f6" strokeWidth="1.5"/>
                  <path d="M6 10c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z" fill="#29b6f6" opacity="0.3"/>
                  <path d="M10 6v4l2.5 2.5" stroke="#29b6f6" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <span>API SCORE</span>
              </div>

              <SidebarNav />

              <div className="sidebar-divider" />

              <SidebarChampions />

              <div className="sidebar-footer">
                <span>v0.1</span>
                <span className="sidebar-footer-dot" />
                <span>Command Center</span>
              </div>
            </aside>

            {/* ── Corps principal ── */}
            <div className="app-body">
              <header className="navbar">
                <DateBar />
              </header>
              <main className="page">{children}</main>
            </div>

            {/* ── Panel droit : coupon ── */}
            <aside className="right-panel">
              <CouponPanel />
            </aside>
          </div>

          <FixtureDetailPanel />
        </Providers>
      </body>
    </html>
  );
}
