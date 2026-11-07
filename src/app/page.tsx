// The home page sends people straight to the case list.
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/cases");
}
