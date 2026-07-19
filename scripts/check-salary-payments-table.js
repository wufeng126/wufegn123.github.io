const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('查询 salary_payments 表...');
  const { data, error } = await supabase
    .from('salary_payments')
    .select('id, worker_id, project_id, year_month, payment_amount, payment_date')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log(`找到 ${data.length} 条发放记录\n`);
  data.forEach(p => {
    console.log(`ID: ${p.id}, 工人 ID: ${p.worker_id}, 项目 ID: ${p.project_id}, 月份：${p.year_month}, 金额：${p.payment_amount}, 日期：${p.payment_date}`);
  });
  
  // 查询总数
  const { count, error: countError } = await supabase
    .from('salary_payments')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error('计数错误:', countError.message);
  } else {
    console.log(`\n总记录数：${count}`);
  }
}

main();
