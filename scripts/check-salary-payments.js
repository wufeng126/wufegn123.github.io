const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('查询工资发放数据...');
  
  // 查询工资发放记录
  const { data: payments, error } = await supabase
    .from('worker_salary_payments')
    .select('id, worker_id, project_id, year_month, payment_amount, payment_date, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log(`找到 ${payments.length} 条发放记录\n`);
  payments.forEach(p => {
    console.log(`ID: ${p.id}, 工人 ID: ${p.worker_id}, 项目 ID: ${p.project_id}, 月份：${p.year_month}, 金额：${p.payment_amount}, 日期：${p.payment_date}, 状态：${p.status}`);
  });
  
  // 查询工人工资记录
  console.log('\n查询工人工资记录...');
  const { data: salaries, error: salaryError } = await supabase
    .from('worker_salaries')
    .select('id, worker_id, project_id, year_month, gross_pay, net_pay, payment_status')
    .limit(10);
  
  if (salaryError) {
    console.error('错误:', salaryError.message);
    return;
  }
  
  console.log(`找到 ${salaries.length} 条工资记录\n`);
  salaries.forEach(s => {
    console.log(`ID: ${s.id}, 工人 ID: ${s.worker_id}, 项目 ID: ${s.project_id}, 月份：${s.year_month}, 应发：${s.gross_pay}, 实发：${s.net_pay}, 发放状态：${s.payment_status}`);
  });
}

main();
