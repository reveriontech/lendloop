"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORIES } from "../../../convex/schema";
import { formatCategory, formatCondition } from "@/lib/format";
import { Search } from "lucide-react";
import { BorrowDialog } from "@/components/borrow-dialog";
import { Id } from "../../../convex/_generated/dataModel";

export default function BrowseToolsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [borrowToolId, setBorrowToolId] = useState<Id<"tools"> | null>(null);

  const tools = useQuery(api.tools.list, {
    search: search || undefined,
    category: category !== "all" ? category : undefined,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Browse Tools</h1>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => v && setCategory(v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {formatCategory(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tools === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="mb-2 h-5 w-3/4 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tools.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {search || category !== "all"
              ? "No tools match your filters."
              : "No tools listed yet. Be the first to share!"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Card key={tool._id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tool.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">{formatCategory(tool.category)}</Badge>
                  <Badge variant="outline">{formatCondition(tool.condition)}</Badge>
                  <Badge variant={tool.isAvailable ? "default" : "destructive"}>
                    {tool.isAvailable ? "Available" : "On Loan"}
                  </Badge>
                </div>
                <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                  {tool.description}
                </p>
                {tool.isAvailable && (
                  <Button
                    size="sm"
                    onClick={() => setBorrowToolId(tool._id)}
                  >
                    Request to Borrow
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {borrowToolId && (
        <BorrowDialog
          toolId={borrowToolId}
          open={!!borrowToolId}
          onClose={() => setBorrowToolId(null)}
        />
      )}
    </div>
  );
}
