import Link from "next/link";
import LegalPage from "@/components/ui/LegalPage";

export const metadata = { title: "Terms · Roam" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="5 September 2026">
      <p>Short version: Roam is yours to plan trips with. Don&rsquo;t break it, don&rsquo;t use it to harm anyone, and understand that it&rsquo;s a small app run by one person.</p>

      <h2>Using Roam</h2>
      <ul>
        <li>You need to be 16 or older, or using it with a parent.</li>
        <li>Your journeys, notes and files are yours. Roam only stores and shows them for you and the people you invite.</li>
        <li>Don&rsquo;t upload anything you don&rsquo;t have the right to, and don&rsquo;t use Roam to send spam or invites to people who didn&rsquo;t ask.</li>
        <li>Don&rsquo;t try to run up the bill: the features that call outside services have daily allowances, and going around them is a reason to close an account.</li>
      </ul>

      <h2>What Roam is not</h2>
      <ul>
        <li><b>Not travel advice you can rely on.</b> Prices, opening hours, entry rules and the assistant&rsquo;s answers are looked up automatically and can be wrong or out of date. Check with the venue, the airline or the government before you rely on any of it.</li>
        <li><b>Not a booking service.</b> Roam stores your confirmations; it doesn&rsquo;t make reservations or hold tickets.</li>
        <li><b>Not guaranteed to be up.</b> It&rsquo;s a small app. It may go down, change, or stop. Keep your own copies of anything you can&rsquo;t afford to lose.</li>
      </ul>

      <h2>Payments</h2>
      <p>If you pay for Roam, the payment is handled by Stripe and is a one-time purchase unless the checkout says otherwise. Ask for a refund within 14 days if it isn&rsquo;t working for you.</p>

      <h2>Ending things</h2>
      <p>You can delete your account at any time from your profile, and everything goes with it. Roam can close an account that breaks these terms.</p>

      <h2>Law</h2>
      <p>These terms follow the laws of Ontario, Canada.</p>

      <p className="mt-8"><Link href="/privacy">Privacy</Link> · <Link href="/">Home</Link></p>
    </LegalPage>
  );
}
