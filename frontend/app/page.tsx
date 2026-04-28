import { fetchMe } from "@/lib/auth";
import { HomeContent } from "@/components/home-content";

export default async function HomePage() {
  const me = await fetchMe();
  return (
    <main className="mx-auto max-w-2xl p-6 pt-12">
      <HomeContent signedIn={!!me} />
    </main>
  );
}
