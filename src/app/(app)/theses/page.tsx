import { redirect } from "next/navigation";

/** Theses now live inside My Intelligence (Overview/Theses tabs). */
export default function ThesesRedirect() {
  redirect("/intelligence?tab=theses");
}
