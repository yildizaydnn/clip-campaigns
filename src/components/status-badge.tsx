import { Badge } from "@/components/ui/badge";

const CAMPAIGN: Record<string, string> = {
  active: "bg-primary/10 text-primary border-primary/20",
  draft: "bg-muted text-muted-foreground",
  paused: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
};

const SUBMISSION: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  paid: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={CAMPAIGN[status] ?? ""}>
      {status}
    </Badge>
  );
}

export function SubmissionStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={SUBMISSION[status] ?? ""}>
      {status}
    </Badge>
  );
}
