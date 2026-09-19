import { redirect } from "next/navigation";

/** Learn now lives inside My Intelligence. */
export default function LearnRedirect() {
  redirect("/intelligence?tab=learn");
}
