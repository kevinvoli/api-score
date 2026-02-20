'use client';

import { usePathname } from 'next/navigation';

const links = [
  { href: '/live', label: 'Live' },
  { href: '/recommendations', label: 'Recommandations' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/analytics', label: 'Analyse' },
  { href: '/audit', label: 'Audit' }
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav">
      {links.map((link) => {
        const isActive = pathname === link.href || (link.href === '/recommendations' && pathname === '/');
        return (
          <a
            key={link.href}
            className={`sidebar-link${isActive ? ' active' : ''}`}
            href={link.href}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
