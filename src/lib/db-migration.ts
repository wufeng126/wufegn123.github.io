/**
 * 数据库自动迁移模块
 * 应用启动时自动检查并添加缺失字段
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 施工日志表迁移
const CONSTRUCTION_LOGS_MIGRATIONS = [
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS log_date DATE",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS weather VARCHAR(50)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS temperature VARCHAR(50)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS work_location TEXT",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS work_content TEXT",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS content TEXT",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS location TEXT",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS attendance_count INTEGER DEFAULT 0",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS headcount INTEGER DEFAULT 0",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS worker_count INTEGER DEFAULT 0",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS attendance_workers JSONB DEFAULT '[]'::jsonb",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS attendance_worker_ids INTEGER[] DEFAULT '{}'",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS attendance_worker_hours JSONB DEFAULT '[]'::jsonb",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS attendance_days INTEGER DEFAULT 0",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS issues TEXT",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS remarks TEXT",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS submitter_id INTEGER REFERENCES users(id)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS submitter_name VARCHAR(100)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(100)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft'",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS submission_status VARCHAR(50) DEFAULT 'draft'",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'manual'",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS daily_group_id VARCHAR(100)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS scheduled_by VARCHAR(100)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS scheduled_submit_at TIMESTAMP WITH TIME ZONE",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS scheduled_cancelled_at TIMESTAMP WITH TIME ZONE",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS project_name VARCHAR(200)",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS total_hours NUMERIC(10,2) DEFAULT 0",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
  "ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
];

// 所有表的迁移列表
const ALL_MIGRATIONS = [
  ...CONSTRUCTION_LOGS_MIGRATIONS,
  // roles 表
  "ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false",
  // team_groups 表
  `CREATE TABLE IF NOT EXISTS team_groups (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    group_name VARCHAR(200) NOT NULL,
    team_leader VARCHAR(100),
    team_leader_phone VARCHAR(50),
    worker_count INTEGER DEFAULT 0,
    work_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`
  // 未来添加新表的迁移时，在这里追加
];

/**
 * 执行数据库迁移
 */
export async function runMigrations(): Promise<void> {
  console.log('🔄 开始执行数据库迁移...');
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const sql of ALL_MIGRATIONS) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        // 如果是字段已存在的错误，跳过
        if (error.message.includes('already exists') || error.message.includes('does not exist')) {
          skipCount++;
        } else {
          console.error('❌ 迁移失败:', error.message);
          console.error('SQL:', sql);
          errorCount++;
        }
      } else {
        successCount++;
      }
    } catch (err) {
      // 如果是字段已存在的错误，跳过
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('already exists') || errorMsg.includes('does not exist')) {
        skipCount++;
      } else {
        console.error('❌ 迁移异常:', errorMsg);
        console.error('SQL:', sql);
        errorCount++;
      }
    }
  }
  
  console.log(`✅ 数据库迁移完成：成功 ${successCount} 条，跳过 ${skipCount} 条，失败 ${errorCount} 条`);
}

/**
 * 检查表是否存在
 */
export async function checkTableExists(tableName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .limit(1);
  
  if (error) {
    console.error('检查表存在性失败:', error.message);
    return false;
  }
  
  return data.length > 0;
}

/**
 * 创建表（如果不存在）
 */
export async function createTableIfNotExists(tableName: string, columns: string[]): Promise<void> {
  const exists = await checkTableExists(tableName);
  
  if (exists) {
    console.log(`✓ 表 ${tableName} 已存在，跳过创建`);
    return;
  }
  
  const createSQL = `CREATE TABLE ${tableName} (${columns.join(', ')})`;
  
  const { error } = await supabase.rpc('exec_sql', { sql: createSQL });
  
  if (error) {
    console.error(`创建表 ${tableName} 失败:`, error.message);
  } else {
    console.log(`✓ 表 ${tableName} 创建成功`);
  }
}
