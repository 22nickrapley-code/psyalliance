"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "./nav-groups";

export default function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          <div className="nav-links">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(item.href) ? " active" : ""}`}
              >
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {!!item.badge && <span className="nav-badge">{item.badge}</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
