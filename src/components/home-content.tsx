"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wrench, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatCategory } from "@/lib/format";

export default function HomeContent() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Wrench className="size-6 text-primary" />
            <span className="text-xl font-bold">LendLoop</span>
          </div>
          <SignedOut>
            <SignInButton mode="modal">
              <Button>Sign in to lend or borrow</Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <Button>
                Go to Dashboard <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>
          </SignedIn>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Borrow what you need.
            <br />
            Lend what you don&apos;t.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            LendLoop connects neighbors to share tools. List your power drill,
            borrow a pressure washer, and keep things out of landfills.
          </p>
          <SignedOut>
            <SignInButton mode="modal">
              <Button size="lg" className="mt-8">
                Get Started
              </Button>
            </SignInButton>
          </SignedOut>
        </div>

        <section>
          <h2 className="mb-6 text-2xl font-semibold">Available Tools</h2>
          {tools === undefined ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="mb-2 h-5 w-3/4 rounded bg-muted" />
                    <div className="h-4 w-1/3 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : tools.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No tools listed yet. Sign in and be the first to share!
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <Card key={tool._id}>
                  <CardContent className="p-6">
                    <h3 className="mb-2 font-medium">{tool.name}</h3>
                    <Badge variant="secondary">{formatCategory(tool.category)}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
