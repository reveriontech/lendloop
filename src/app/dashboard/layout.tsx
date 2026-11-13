"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench, LayoutDashboard, Package, Send, Inbox, Shield } from "lucide-react";
import { cn } from "cn";

const navItems = [
  { href: "/dashboard", label: "Browse Tools", icon: LayoutDashboard },
  { href: "/dashboard/my-tools", label: "My Listings", icon: Package },
  { href: "/dashboard/my-requests", label: "My Requests", icon: Send },
  { href: "/dashboard/incoming", label: "Incoming Requests", icon: Inbox },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const upsertUser = useMutation(api.auth.upsertUser);
  const me = useQuery(
    api.auth.getMe,
    user ? { clerkId: user.id } : "skip"
  );
  const pathname = usePathname();

  useEffect(() => {
    if (isLoaded && user) {
      upsertUser({
        clerkId: user.id,
        name: user.fullName || user.username || "User",
        email: user.primaryEmailAddress?.emailAddress || "",
      });
    }
  }, [isLoaded, user, upsertUser]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Please sign in to access the dashboard.</p>
      </div>
    );
  }

  const isAdmin = me?.role === "admin";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" />
            <span className="text-lg font-bold">LendLoop</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user.fullName}
              {me?.isTrustedLender && (
                <span className="ml-1 text-xs text-green-600">✓ Trusted</span>
              )}
            </span>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-6">
        <nav className="hidden w-52 shrink-0 md:block">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              </li>
            ))}
            {isAdmin && (
              <li>
                <Link
                  href="/dashboard/admin"
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    pathname === "/dashboard/admin"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Shield className="size-4" />
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
