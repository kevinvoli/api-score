import './globals.css';
import { ReactNode } from 'react';
import Providers from './providers';
import { NavLinks } from '../components/nav-links/NavLinks';
import { SidebarChampions } from '../components/sidebar-champions/SidebarChampions';
import { CouponPanel } from '../components/coupon-panel/CouponPanel';
import { FixtureDetailPanel } from '../components/fixture-detail-panel/FixtureDetailPanel';

export const metadata = {
  title: 'API SCORE | Command Center',
  description: 'Plateforme de paris football live orientée décision rapide'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <div className="app-shell">
            <aside className="sidebar">
              <div className="sidebar-brand">API SCORE</div>
              <SidebarChampions />
              <div className="sidebar-footer">v0.1 Command Center</div>
            </aside>

            <div className="app-body">
              <header className="navbar">
                <NavLinks />
              </header>

              <main className="page">{children}</main>
            </div>

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
