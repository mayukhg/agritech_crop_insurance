/** Hours since last inbound — used for WhatsApp 24h template window. */
export function hoursSinceLastInbound(
  lastInboundAt: Date | null | undefined,
  now = new Date(),
): number {
  if (!lastInboundAt) return Number.POSITIVE_INFINITY;
  return (now.getTime() - lastInboundAt.getTime()) / (1000 * 60 * 60);
}

export function mustUseApprovedTemplate(
  lastInboundAt: Date | null | undefined,
  now = new Date(),
): boolean {
  return hoursSinceLastInbound(lastInboundAt, now) > 24;
}
