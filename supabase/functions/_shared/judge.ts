export function isCandidate(
  h: { hotelNo: number; hotelMinCharge?: number },
  opts: { minChargeJpy: number },
): boolean {
  return h.hotelMinCharge !== undefined && h.hotelMinCharge >= opts.minChargeJpy;
}
