import './globals.css';
import { ReactNode } from 'react';
import Providers from './providers';
import SidebarNav from './SidebarNav';

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
              <SidebarNav />
              <div className="sidebar-footer">v0.1 Command Center</div>
            </aside>

            <div className="app-body">
              <header className="navbar">
                <div>
                  <span className="navbar-title">Centre de Commande</span>
                  <span className="navbar-sub">OpÃ©rations live</span>
                </div>
                <div className="navbar-actions">
                  <button className="navbar-btn" type="button">
                    Exporter
                  </button>
                  <button className="navbar-btn primary" type="button">
                    Synchroniser
                  </button>
                </div>
              </header>

              <main className="page">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
