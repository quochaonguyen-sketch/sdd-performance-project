/** Round once on the displayed rider's Pick total, including week/month views. */
export function performanceConversion(delivered: number, picked: number) {
  const convertedPickup = Math.ceil(picked / 3);
  const total = delivered + convertedPickup;
  const deliveryShare = total > 0 ? delivered / total * 100 : null;
  return {
    convertedPickup,
    total,
    deliveryShare,
    pickupShare: deliveryShare === null ? null : 100 - deliveryShare,
  };
}
