"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Brand } from "@/components/lendloop-brand";
import { Button, buttonVariants } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Browse tools" },
  { href: "/dashboard/my-tools", label: "My listings" },
  { href: "/dashboard/incoming", label: "Incoming requests" },
  { href: "/dashboard/my-requests", label: "My requests" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: isVerifyingSession } = useConvexAuth();
  const upsertUser = useMutation(api.auth.upsertUser);
  const me = useQuery(api.auth.getMe, user && isAuthenticated ? { clerkId: user.id } : "skip");
  const requests = useQuery(api.borrowRequests.listByLender, user && me ? { clerkId: user.id } : "skip");
  const pathname = usePathname();
  const [profileError, setProfileError] = useState("");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (me || (isLoaded && !user)) return;
    const timeout = window.setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => window.clearTimeout(timeout);
  }, [isLoaded, me, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let active = true;
    upsertUser({
      clerkId: user.id,
      name: user.fullName || user.username || "User",
      email: user.primaryEmailAddress?.emailAddress || "",
    }).catch(() => {
      if (active) setProfileError("Could not set up your profile. Refresh the page to try again.");
    });
    return () => { active = false; };
  }, [isAuthenticated, user, upsertUser]);

  if (isLoaded && !user) {
    return (
      <main className="grid min-h-screen place-content-center gap-4 text-center">
        <p>Sign in to access the lending board.</p>
        <Link href="/sign-in" className={buttonVariants()}>Sign in</Link>
      </main>
    );
  }

  if (!me) {
    const sessionRejected = isLoaded && user && !isVerifyingSession && !isAuthenticated;
    const error = profileError || (sessionRejected
      ? "We couldn’t verify your sign-in with the lending board."
      : loadingTimedOut ? "The lending board is taking too long to connect." : "");

    return (
      <main className="grid min-h-screen place-content-center gap-4 px-6 text-center">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => window.location.reload()}>Try again</Button>
              {user && <UserButton />}
            </div>
          </>
        ) : <p className="text-muted-foreground" role="status">Loading your board…</p>}
      </main>
    );
  }

  const pending = requests?.filter((request) => request.status === "pending").length ?? 0;
  const items = me.role === "admin" ? [...navItems, { href: "/dashboard/admin", label: "Admin" }] : navItems;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur-md">
        <div className="site-wrap flex min-h-16 flex-wrap items-center gap-x-3 pt-2.5 min-[761px]:flex-nowrap min-[761px]:gap-x-7 min-[761px]:pt-0">
          <div className="shrink-0"><Brand href="/dashboard" /></div>
          <nav aria-label="Dashboard" className="order-last flex w-full min-w-0 gap-0.5 overflow-x-auto pb-1.5 [scrollbar-width:none] min-[761px]:order-none min-[761px]:w-auto min-[761px]:flex-1 min-[761px]:pb-0">
            {items.map(({ href, label }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined} className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[14.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-[#ebece8] aria-[current=page]:font-semibold aria-[current=page]:text-foreground">
                  {label}
                  {href === "/dashboard/incoming" && pending > 0 && <span className="rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground">{pending}<span className="sr-only"> waiting</span></span>}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Link href="/dashboard/my-tools/new" className={buttonVariants({ size: "sm" })}><Plus /><span className="hidden min-[641px]:inline">List a tool</span><span className="sr-only min-[641px]:hidden">List a tool</span></Link>
            <UserButton />
          </div>
        </div>
      </header>
      <main className="site-wrap pt-8 pb-[72px] min-[761px]:pt-10">{children}</main>
    </div>
  );
}
