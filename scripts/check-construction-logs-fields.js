const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: dbColumns, error } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_name', 'construction_logs')
    .eq('table_schema', 'public');
  
  if (error) {
    console.error('查询数据库字段错误:', error.message);
    return;
  }
  
  const dbFieldSet = new Set(dbColumns.map(c => c.column_name));
  console.log('数据库已有字段 (' + dbColumns.length + '个):');
  dbColumns.forEach(c => console.log('  ✓ ' + c.column_name));
  console.log('\n');
  
  const codeFields = [
    'id', 'project_id', 'log_date', 'weather', 'temperature',
    'work_location', 'work_content', 'content', 'location',
    'attendance_count', 'headcount', 'worker_count',
    'attendance_workers', 'attendance_worker_ids', 'attendance_worker_hours', 'attendance_days',
    'attachments', 'issues', 'remarks',
    'submitter_id', 'submitter_name', 'user_id', 'user_name', 'created_by',
    'status', 'submission_status', 'source_type',
    'daily_group_id',
    'scheduled_by', 'scheduled_submit_at', 'scheduled_cancelled_at',
    'project_name', 'total_hours',
    'created_at', 'updated_at'
  ];
  
  const missingFields = codeFields.filter(f => !dbFieldSet.has(f));
  
  if (missingFields.length > 0) {
    console.log('❌ 缺失字段 (' + missingFields.length + '个):', missingFields.join(', '));
  } else {
    console.log('✅ 所有字段都已存在！');
  }
}

main();
