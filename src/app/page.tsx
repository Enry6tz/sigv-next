import { PassengerHeader } from "@/components/passenger-header";
import { PassengerSearch } from "@/components/passenger-search";
import { appSprint, dataProvider } from "@/lib/sprint";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  let signedIn = false;
  if (dataProvider === "supabase") {
    const client = await createClient();
    const { data } = await client.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }
  return <><PassengerHeader signedIn={signedIn} sprint={appSprint} /><main><PassengerSearch initialQuery={{ origin: "", destination: "", date: "" }} sprint={appSprint} /></main></>;
}
