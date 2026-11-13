"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CATEGORIES, CONDITIONS } from "../../../../convex/schema";
import { formatCategory, formatCondition } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

export default function MyToolsPage() {
  const { user } = useUser();
  const tools = useQuery(api.tools.listByOwner, user ? { clerkId: user.id } : "skip");
  const createTool = useMutation(api.tools.create);
  const removeTool = useMutation(api.tools.remove);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "power_tools",
    condition: "good",
    description: "",
  });
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!user) return;
    setLoading(true);
    try {
      await createTool({ clerkId: user.id, ...form });
      setShowCreate(false);
      setForm({ name: "", category: "power_tools", condition: "good", description: "" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(toolId: Id<"tools">) {
    if (!user) return;
    await removeTool({ clerkId: user.id, toolId });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Listings</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 size-4" /> List a Tool
        </Button>
      </div>

      {tools === undefined ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 w-1/2 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tools.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            You haven&apos;t listed any tools yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <Card key={tool._id}>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{tool.name}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemove(tool._id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{formatCategory(tool.category)}</Badge>
                  <Badge variant="outline">{formatCondition(tool.condition)}</Badge>
                  <Badge variant={tool.isAvailable ? "default" : "destructive"}>
                    {tool.isAvailable ? "Available" : "On Loan"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>List a New Tool</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Tool Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. DeWalt Cordless Drill"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <Select
                value={form.category}
                onValueChange={(v) => v && setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {formatCategory(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Condition</label>
              <Select
                value={form.condition}
                onValueChange={(v) => v && setForm({ ...form, condition: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((cond) => (
                    <SelectItem key={cond} value={cond}>
                      {formatCondition(cond)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the tool"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading || !form.name || !form.description}
            >
              {loading ? "Creating..." : "List Tool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
