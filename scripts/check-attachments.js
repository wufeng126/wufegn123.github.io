const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('查询证件附件数据...');
  const { data, error } = await supabase
    .from('certificates')
    .select('id, name, attachments')
    .limit(5);
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log(`找到 ${data.length} 条记录\n`);
  
  data.forEach(cert => {
    console.log(`证件：${cert.name}`);
    console.log(`附件：`, JSON.stringify(cert.attachments, null, 2));
    console.log('---');
  });
}

main();
