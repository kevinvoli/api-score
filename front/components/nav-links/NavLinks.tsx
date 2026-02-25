'use client';

import { usePathname } from 'next/navigation';

const links = [
  { href: '/live', label: 'Live' },
  { href: '/recommendations', label: 'Recommandations' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/analytics', label: 'Analyse' },
  { href: '/audit', label: 'Audit' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="navbar-nav">
      {links.map((link) => {
        const isActive =
          pathname === link.href ||
          (link.href === '/recommendations' && pathname === '/');
        return (
          <a
            key={link.href}
            href={link.href}
            className={`navbar-nav-link${isActive ? ' active' : ''}`}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
