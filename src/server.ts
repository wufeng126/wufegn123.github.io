import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { runMigrations } from './lib/db-migration';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.DEPLOY_RUN_PORT || process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 数据库迁移：默认不再每次启动自动重放（迁移集合含数据去重/RLS 语句，重放有删数据风险）。
  // 需要自动迁移时显式设置 AUTO_MIGRATE=1，或由超管调用 POST /api/system/migrate。
  if (process.env.COZE_PROJECT_ENV === 'PROD' && process.env.AUTO_MIGRATE === '1') {
    try {
      const migrationResult = await runMigrations();
      if (migrationResult.ok) {
        console.log(`[DB Migration] ${migrationResult.message}`);
      } else {
        console.warn(`[DB Migration] ${migrationResult.message}`);
        if (migrationResult.error) console.warn(`[DB Migration] ${migrationResult.error}`);
        if (migrationResult.manualUrl) console.warn(`[DB Migration] Manual URL: ${migrationResult.manualUrl}`);
      }
    } catch (err) {
      console.error('数据库迁移失败:', err);
    }
  }
  
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
