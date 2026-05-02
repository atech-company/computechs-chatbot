/**
 * FAQ dataset for SUPPORT intent — assistant must only cite these facts,
 * not invent shipping/legal/policy details.
 */
export const FAQ_ENTRIES: { q: string; a: string }[] = [
  {
    q: "shipping",
    a: "Standard delivery timelines depend on your area and item availability. At checkout you will see the options available for your address. For urgent requests, contact us by phone and reference your order number.",
  },
  {
    q: "returns",
    a: "Eligible items may be returned within the window stated on your order confirmation, unused and in original packaging where applicable. Open software and personalized builds may be excluded — confirm at purchase.",
  },
  {
    q: "warranty",
    a: "New hardware typically carries manufacturer warranty; duration varies by brand and product family. Keep your invoice — warranty service is coordinated with the manufacturer or authorized service partners.",
  },
  {
    q: "payment",
    a: "Available payment methods are shown at checkout (cards and locally supported options). For offline or corporate billing, ask our team for available arrangements.",
  },
  {
    q: "order tracking",
    a: "Once shipped, you should receive tracking details by email/SMS if enabled on your account. If you do not see updates within the stated handling time, reply here with your order ID.",
  },
  {
    q: "pickup",
    a: "Store pickup may be offered depending on stock location and branch hours. Choose pickup at checkout when available, or ask us to confirm before paying.",
  },
];

export function faqBlob(): string {
  return FAQ_ENTRIES.map((e) => `Q (${e.q}): ${e.a}`).join("\n\n");
}
