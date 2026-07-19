const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('查询项目数据...');
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, year, status')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log(`找到 ${data.length} 个项目\n`);
  data.forEach(project => {
    console.log(`ID: ${project.id}, 名称：${project.name}, 年度：${project.year}, 状态：${project.status}`);
  });
}

main();
