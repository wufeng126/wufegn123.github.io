const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('测试工资发放 API 查询...\n');
  
  // 模拟 API 查询
  const { data, error } = await supabase
    .from('salary_payments')
    .select(`
      id,
      salary_id,
      worker_id,
      project_id,
      year_month,
      payment_amount,
      payment_date,
      payment_type,
      remark,
      created_at,
      workers (
        name
      ),
      projects (
        name
      )
    `)
    .order('payment_date', { ascending: false });
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log(`找到 ${data.length} 条记录\n`);
  data.forEach(record => {
    console.log(`ID: ${record.id}`);
    console.log(`  工人：${record.workers?.name || '未知'} (ID: ${record.worker_id})`);
    console.log(`  项目：${record.projects?.name || '未知'} (ID: ${record.project_id})`);
    console.log(`  月份：${record.year_month}`);
    console.log(`  金额：${record.payment_amount}`);
    console.log(`  日期：${record.payment_date}`);
    console.log('---');
  });
}

main();
