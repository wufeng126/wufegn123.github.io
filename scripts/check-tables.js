const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('查询所有表...');
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name');
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log('数据库表列表：\n');
  data.forEach(t => {
    if (t.table_name.includes('salary') || t.table_name.includes('payment') || t.table_name.includes('worker')) {
      console.log(`  ✓ ${t.table_name}`);
    }
  });
}

main();
