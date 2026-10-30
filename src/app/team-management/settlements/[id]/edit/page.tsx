import { notFound } from 'next/navigation';
import { TeamSettlementNewPageClient } from '../../../_components/team-management-client';

export default async function EditTeamSettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settlementId = Number(id);
  if (!Number.isInteger(settlementId) || settlementId <= 0) notFound();
  return <TeamSettlementNewPageClient editSettlementId={settlementId} />;
}
