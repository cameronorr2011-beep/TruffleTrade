import { redirect } from "next/navigation";

/** Journal now lives inside My Intelligence. */
export default function JournalRedirect() {
  redirect("/intelligence?tab=journal");
}
