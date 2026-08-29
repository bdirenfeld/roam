import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import IdeasClient, { type Idea } from "@/components/trip/IdeasClient";

export default async function IdeasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("ideas")
    .select("id, url, title, note, source, status, tags, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <IdeasClient initial={(data ?? []) as Idea[]} />;
}
