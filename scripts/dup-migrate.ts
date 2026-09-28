import { loadEnv } from '../src/storage/database/supabase-client';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseCredentials } from '../src/storage/database/supabase-client';

// mapping: main_id  <-(- worker_id) （将 worker_id 合并到 main_id）
const MAPPING: Array<[number, number]> = [
  [1123, 1307], [1135, 1297], [1126, 1303], [758, 1276],
  [1041, 760], [1041, 1362], [1041, 1439], [1041, 1446], [1041, 1444],
  [1125, 1293], [1127, 1299], [1128, 1302], [906, 1287], [569, 1168],
  [1131, 1304], [1137, 1308], [780, 1282], [1092, 1146], [1112, 1145],
  [1369, 1533], [1129, 1300], [1132, 1294], [1113, 1139], [1136, 1305],
  [1144, 1248], [904, 1532], [1124, 1306], [1040, 1482], [1130, 1301],
  [1134, 1296], [1133, 1295], [1278, 1450], [1256, 1211], [907, 1470],
  [777, 1284], [781, 1283], [1138, 1162], [786, 1286], [1077, 1536],
  [1279, 1485],
];

// 需要迁移的表
const TABLES = [
  'worker_assignments',
  'construction_log_attendance',
  'site_manager_worker_scopes',
  'wps_worker_sync_logs',
];

async function main() {
  loadEnv();
  const creds = getSupabaseCredentials();
  const sb = createClient(creds.url, creds.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { timeout: 120000 },
  });

  const fromIds = MAPPING.map(([, w]) => w);

  for (const table of TABLES) {
    // 1. 找出该表当前仍挂在从 worker_id 上的行
    const { data: rows, error: selErr } = await sb
      .from(table)
      .select('*')
      .in('worker_id', fromIds);
    if (selErr) {
      console.log(`[${table}] select error:`, selErr.message);
      continue;
    }
    console.log(`[${table}] rows to migrate:`, rows ? rows.length : 0);

    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const mapping = MAPPING.find(([, w]) => w === row.worker_id)!;
      const mainId = mapping[0];
      // 更新该行 worker_id 到 main_id
      const { error } = await sb
        .from(table)
        .update({ worker_id: mainId })
        .eq('id', row.id);
      if (error) {
        console.log(`[${table}] update id=${row.id} err:`, error.message);
      }
    }
  }

  // 汇总剩余
  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select('id').in('worker_id', fromIds);
    console.log(`[${table}] residual after:`, data ? data.length : (error ? 'ERR ' + error.message : '?'));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });