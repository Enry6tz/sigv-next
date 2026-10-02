import { redirect } from "next/navigation";

export default async function RolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  redirect(`/${role}/inicio`);
}
