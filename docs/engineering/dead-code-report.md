# 死代码体检报告

生成时间：2026-11-02T08:10:01.847Z

- API 路由总数：235，疑似未被引用：**19**
- 页面总数：90，疑似不在菜单/权限表：**8**

> 说明：这是静态文本匹配的粗筛结果，可能包含误报（例如动态拼接的 URL、由服务端内部调用的接口）。删除前请逐个确认。

## 疑似未被前端引用的 API

- `/api/ai/knowledge/refresh`
- `/api/ai/knowledge/sync`
- `/api/auth/center/users/managed-projects`
- `/api/auth/debug`
- `/api/backups/settings`
- `/api/dingtalk/card/register`
- `/api/limit-prices/export`
- `/api/limit-prices/import`
- `/api/living-allowances/sync-salary`
- `/api/notifications/feishu`
- `/api/payments/stats`
- `/api/settlements/export`
- `/api/settlements/import`
- `/api/storage/diagnostic`
- `/api/supplier-contracts/account`
- `/api/supplier-contracts/account-dashboard`
- `/api/supplier-settlements/batch-delete`
- `/api/system/backups/cron`
- `/api/workers/clean`

## 疑似不在菜单/权限表的页面

- `/cost-estimation/bid/history`
- `/cost-estimation/bid/import`
- `/cost-estimation/bid/new`
- `/cost-estimation/import`
- `/knowledge/monthly/new`
- `/knowledge/new`
- `/reports/monthly/fill`
- `/system/storage-diagnostic`
