"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatStatus, statusColor } from "@/lib/format";
import { Shield, Star, Trash2 } from "lucide-react";

export default function AdminContent() {
  const { user } = useUser();
  const me = useQuery(api.auth.getMe, user ? { clerkId: user.id } : "skip");
  const users = useQuery(api.admin.listUsers, user ? { clerkId: user.id } : "skip");
  const allLoans = useQuery(api.admin.listAllLoans, user ? { clerkId: user.id } : "skip");
  const allTools = useQuery(api.tools.list, {});
  const setTrustedLender = useMutation(api.admin.setTrustedLender);
  const adminRemoveTool = useMutation(api.tools.adminRemove);

  if (me && me.role !== "admin") {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          You do not have admin access.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Shield className="size-6" />
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="tools">All Tools</TabsTrigger>
          <TabsTrigger value="loans">All Loans</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          {users === undefined ? (
            <div className="animate-pulse">Loading...</div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <Card key={u._id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                      <div className="mt-1 flex gap-2">
                        <Badge variant="secondary">{u.role}</Badge>
                        {u.isTrustedLender && (
                          <Badge variant="default">Trusted Lender</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={u.isTrustedLender ? "outline" : "default"}
                      onClick={() =>
                        user &&
                        setTrustedLender({
                          clerkId: user.id,
                          userId: u._id,
                          trusted: !u.isTrustedLender,
                        })
                      }
                    >
                      <Star className="mr-1 size-3" />
                      {u.isTrustedLender ? "Remove Trusted" : "Mark Trusted"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          {allTools === undefined ? (
            <div className="animate-pulse">Loading...</div>
          ) : (
            <div className="space-y-2">
              {allTools.map((tool) => (
                <Card key={tool._id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{tool.name}</p>
                      <Badge variant={tool.isAvailable ? "default" : "destructive"}>
                        {tool.isAvailable ? "Available" : "On Loan"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        user &&
                        adminRemoveTool({ clerkId: user.id, toolId: tool._id })
                      }
                    >
                      <Trash2 className="mr-1 size-3" /> Remove
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="loans" className="mt-4">
          {allLoans === undefined ? (
            <div className="animate-pulse">Loading...</div>
          ) : allLoans.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No loan records.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {allLoans.map((loan) => (
                <Card key={loan._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{loan.toolName}</p>
                        <p className="text-sm text-muted-foreground">
                          {loan.borrowerName} ← {loan.lenderName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {loan.startDate} → {loan.endDate}
                        </p>
                      </div>
                      <Badge variant={statusColor(loan.status)}>
                        {formatStatus(loan.status)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
