export function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCondition(cond: string): string {
  return cond
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function statusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending":
      return "secondary";
    case "approved":
    case "returned":
      return "default";
    case "declined":
    case "overdue":
      return "destructive";
    case "borrowed":
      return "outline";
    default:
      return "secondary";
  }
}
