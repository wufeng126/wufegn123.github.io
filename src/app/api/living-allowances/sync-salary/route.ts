import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { syncLivingAllowancesToSalary } from '@/lib/living-allowance';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const salaryId = normalizeId(body.salary_id);
    if (!salaryId) return NextResponse.json({ error: '缺少工资记录ID' }, { status: 400 });

    const client = getSupabaseClient();
    const { data: salary, error } = await client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, gross_pay, income_tax, advance_pay, labor_insurance, fine')
      .eq('id', salaryId)
      .maybeSingle();

    if (error) throw new Error(`查询工资记录失败: ${error.message}`);
    if (!salary) return NextResponse.json({ error: '工资记录不存在' }, { status: 404 });

    const syncResult = await syncLivingAllowancesToSalary(client, salary as any);
    const { data: updatedSalary } = await client
      .from('worker_salaries')
      .select('*')
      .eq('id', salaryId)
      .maybeSingle();

    return NextResponse.json({ salary: updatedSalary, livingAllowanceSync: syncResult });
  } catch (error: unknown) {
    console.error('[LivingAllowanceSyncSalary] POST error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '同步失败') }, { status: 500 });
  }
}
