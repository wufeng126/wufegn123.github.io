const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('查询所有证件记录...');
  const { data, error } = await supabase
    .from('certificates')
    .select('id, name, attachments')
    .not('attachments', 'is', null);
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log(`找到 ${data.length} 条有附件的记录\n`);
  
  data.forEach(cert => {
    console.log(`ID: ${cert.id}, 证件：${cert.name}`);
    console.log(`附件：`, JSON.stringify(cert.attachments));
    console.log('---');
  });
}

main();
