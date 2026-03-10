"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  LayoutDashboard,
  Upload,
  FolderTree,
  Search,
  Package,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/contexts/AuthContext";

const publicNav = [
  { href: "/", label: "Catalog", icon: ShoppingBag },
  { href: "/search", label: "Search", icon: Search },
];

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/upload", label: "Upload", icon: Upload },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
];

export default function Navbar() {
  const path = usePathname();
  const { user, loading, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-purple-100 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg text-brand-700">
          <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
            <ShoppingBag size={15} className="text-white" />
          </div>
          SmartShop
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {publicNav.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== "/" && path.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-100 text-brand-700"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                )}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}

          {/* Admin-only nav links */}
          {user?.is_admin &&
            adminNav.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== "/" && path.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-100 text-brand-700"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  )}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}

          {/* Auth section */}
          {!loading && (
            user ? (
              <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200">
                <span className="hidden md:flex items-center gap-1 text-xs text-slate-500 px-1 py-1">
                  <User size={12} />
                  {user.email.split("@")[0]}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                  title="Sign out"
                >
                  <LogOut size={15} />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors ml-1"
              >
                <LogIn size={15} />
                <span className="hidden sm:inline">Sign In</span>
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
