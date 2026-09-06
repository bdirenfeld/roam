import Link from "next/link";
import LegalPage from "@/components/ui/LegalPage";

export const metadata = { title: "Privacy · Roam" };

// Plain words, no legalese. Every sentence is true of the code as built.
// Brennan reads and signs off the wording (scale audit, Sept 2026).

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="5 September 2026">
      <p>Roam is a travel planner. This page says what it keeps about you, why, and how to take it back.</p>

      <h2>What Roam keeps</h2>
      <ul>
        <li><b>Your sign-in.</b> Your name, email address and profile picture from Google, or your email address if you sign in by email. Nothing else from your Google account.</li>
        <li><b>Your journeys.</b> Destinations, dates, the places you save, the days you plan, notes, budgets, travellers&rsquo; names and ages, and the entry requirements Roam looks up for you.</li>
        <li><b>Files you attach.</b> Booking confirmations and tickets you upload, stored privately and shown only to you and the people you share the journey with.</li>
        <li><b>Ideas you save.</b> Links you send to Roam from other apps.</li>
        <li><b>Usage counts.</b> How many times a day you use the features that call outside services, so no one can run up the bill.</li>
      </ul>

      <h2>Who else sees it</h2>
      <ul>
        <li><b>People you invite.</b> A guest sees the journey you shared: its days, places, notes and attachments. They cannot see your other journeys.</li>
        <li><b>Services Roam uses to work.</b> Google (place search and photos), Mapbox (maps), Anthropic (the assistant, price lookups and entry-rule lookups), Unsplash (cover photos), Resend (invite emails), Stripe (payments), Supabase (the database) and Vercel (hosting). Each receives only what it needs for that job. Roam does not sell or share your data for advertising.</li>
      </ul>

      <h2>Where it lives</h2>
      <p>The database is in Canada (Montréal). Hosting and the services above run in the United States and Europe.</p>

      <h2>Taking it back</h2>
      <ul>
        <li><b>Delete your account.</b> Profile → Delete account removes every journey, place, note, file and idea, and your sign-in, immediately and for good. Journeys you were invited to are untouched; only your membership goes.</li>
        <li><b>Leave a journey.</b> Ask the person who invited you to revoke the link, or delete your account.</li>
        <li><b>Questions.</b> Email <a href="mailto:bdirenfeld@gmail.com">bdirenfeld@gmail.com</a>.</li>
      </ul>

      <h2>Cookies</h2>
      <p>One cookie keeps you signed in. There are no advertising or tracking cookies.</p>

      <p className="mt-8"><Link href="/terms">Terms of use</Link> · <Link href="/">Home</Link></p>
    </LegalPage>
  );
}
