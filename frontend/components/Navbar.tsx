"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  LayoutDashboard,
  Upload,
  FolderTree,
  Search,
  LogIn,
  LogOut,
  User,
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [...publicNav, ...(user?.is_admin ? adminNav : [])];

  const linkClass = (active: boolean, mobile: boolean) =>
    clsx(
      "flex items-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
      mobile ? "px-3 py-2.5" : "px-3 py-1.5",
      active
        ? "bg-brand-100 text-brand-700"
        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
    );

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

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== "/" && path.startsWith(href));
            return (
              <Link key={href} href={href} className={linkClass(active, false)}>
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            );
          })}

          {!loading && (
            user ? (
              <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200">
                <span className="hidden lg:flex items-center gap-1 text-xs text-slate-500 px-1 py-1">
                  <User size={12} />
                  {user.email.split("@")[0]}
                </span>
                <button onClick={logout} className={linkClass(false, false)} title="Sign out">
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors ml-1"
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </Link>
            )
          )}
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-purple-100 bg-white px-4 py-2 space-y-0.5">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== "/" && path.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={linkClass(active, true)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            );
          })}

          {!loading && (
            user ? (
              <button
                onClick={() => { setMobileOpen(false); logout(); }}
                className={clsx(linkClass(false, true), "w-full")}
              >
                <LogOut size={17} />
                <span>Sign Out ({user.email.split("@")[0]})</span>
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
              >
                <LogIn size={17} />
                <span>Sign In</span>
              </Link>
            )
          )}
        </nav>
      )}
    </header>
  );
}
