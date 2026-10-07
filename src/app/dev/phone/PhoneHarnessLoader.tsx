"use client";

// Browser only: the fixture data layer has to be in place before the real
// components' first effect, and fixture dates follow the phone's local today.
import dynamic from "next/dynamic";
import type { ClientScreen } from "./screens";

const PhoneHarness = dynamic(() => import("./PhoneHarness"), { ssr: false });

export default function PhoneHarnessLoader({ screen }: { screen: ClientScreen }) {
  return <PhoneHarness screen={screen} />;
}
