import { redirect } from "next/navigation";

// The old landing page; the story now lives at the root.
export default function Welcome() {
  redirect("/");
}
