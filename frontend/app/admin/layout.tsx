"use client";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (!user.is_admin) {
      router.replace("/");
    }
  }, [user, loading, pathname]);

  if (loading || !user) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={32} className="animate-spin text-brand-400" />
      </div>
    );
  }

  if (!user.is_admin) return null;

  return <>{children}</>;
}
