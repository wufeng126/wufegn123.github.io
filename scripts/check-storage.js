const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

console.log('Supabase URL:', SUPABASE_URL);
console.log('Supabase Key:', SUPABASE_KEY ? '已配置' : '未配置');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('\n查询 Storage Buckets...');
  const { data, error } = await supabase.storage.listBuckets();
  
  if (error) {
    console.error('错误:', error.message);
    return;
  }
  
  console.log('找到以下 Buckets:');
  data.forEach(bucket => {
    console.log(`  - ${bucket.name} (公开：${bucket.public})`);
  });
  
  // 尝试列出 certificates bucket 的文件
  if (data.some(b => b.name === 'certificates')) {
    console.log('\n查询 certificates bucket 中的文件...');
    const { data: files, error: fileError } = await supabase.storage
      .from('certificates')
      .list('4');
    
    if (fileError) {
      console.error('错误:', fileError.message);
    } else {
      console.log('找到文件:', files);
    }
  }
}

main();
