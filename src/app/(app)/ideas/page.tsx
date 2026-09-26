import { redirect } from "next/navigation";

// Ideas was retired on 26 Sep 2026: a share from TikTok or Instagram now lands
// straight on a journey's map or the Wishlist. The rows stay in `ideas` for the
// record; this address only forwards old links and installed-app shortcuts.
export default function IdeasPage() {
  redirect("/trips");
}
