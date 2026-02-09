"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Search,
  ShoppingCart,
  MessageSquare,
  Settings,
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Upload
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/sourcing", label: "수집", icon: Search },
  { href: "/products", label: "상품 관리", icon: Package },
  { href: "/policies", label: "정책 관리", icon: FileText },
  { href: "/policy-apply", label: "정책 적용", icon: ClipboardCheck },
  { href: "/product-update", label: "상품 업데이트", icon: Upload },
  { href: "/orders", label: "주문 관리", icon: ShoppingCart },
  { href: "/cs", label: "CS 관리", icon: MessageSquare },
  { href: "/settings", label: "환경설정", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-lg font-bold tracking-tight">VibeCoding ERP</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
