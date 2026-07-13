import { redirect } from 'next/navigation';

interface WorkItemsRedirectPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkItemsRedirectPage({ searchParams }: WorkItemsRedirectPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  redirect(`/quantity-reporting${suffix}`);
}
