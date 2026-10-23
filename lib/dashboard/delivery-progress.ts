export function summarizeDeliveryProgress(riders: readonly { total_assigned: number; delivered: number }[]) {
  const totalAssigned = riders.reduce((sum, rider) => sum + rider.total_assigned, 0);
  const delivered = riders.reduce((sum, rider) => sum + rider.delivered, 0);
  const rate = totalAssigned > 0 ? Math.round(delivered / totalAssigned * 100) : 0;
  return { totalAssigned, delivered, rate, avgProgress: rate };
}
