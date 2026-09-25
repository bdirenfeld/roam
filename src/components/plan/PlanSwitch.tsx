"use client";

/**
 * The Plan route serves two screens (24 Sep 2026): the week (WeekBoard) at
 * md and above, the old day-column board (PlanBoard) below it. Only one is
 * mounted — PlanBoard is 2,500 lines with its own effects and sheets, and
 * mounting both behind CSS would run all of it twice. The server renders the
 * week (the phone has no door to /plan, so that is the common case) and a
 * phone that does land here swaps after mount.
 */

import { useEffect, useState } from "react";
import type { Trip, DayWithCards, ListWithCards } from "@/types/database";
import WeekBoard from "./WeekBoard";
import PlanBoard from "./PlanBoard";

interface Props {
  trip: Trip;
  initialDays: DayWithCards[];
  initialLists: ListWithCards[];
  initialNotes: string | null;
}

export default function PlanSwitch(props: Props) {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  if (phone) return <PlanBoard {...props} />;
  return <WeekBoard trip={props.trip} initialDays={props.initialDays} />;
}
