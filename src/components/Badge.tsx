type Variant = 'ok' | 'warn' | 'bad' | 'info';

interface BadgeProps {
  variant: Variant;
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge ${variant}`}>{children}</span>;
}

export function statusBadge(status: string) {
  const map: Record<string, Variant> = {
    Approved: 'ok', Received: 'ok', Active: 'ok',
    Pending: 'warn', Ordered: 'warn', Verified: 'warn',
    Rejected: 'bad', Cancelled: 'bad',
  };
  return <Badge variant={map[status] ?? 'info'}>{status}</Badge>;
}
