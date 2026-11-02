# 死代码体检报告

生成时间：2026-11-02T08:51:34.314Z

- API 路由总数：225，疑似未被引用：**8**
- 页面总数：89，疑似不在菜单/权限表：**7**

> 说明：这是静态文本匹配的粗筛结果，可能包含误报（例如动态拼接的 URL、由服务端内部调用的接口）。删除前请逐个确认。

## 疑似未被前端引用的 API

- `/api/ai/knowledge/refresh`
- `/api/ai/knowledge/sync`
- `/api/backups/settings`
- `/api/dingtalk/card/register`
- `/api/settlements/import`
- `/api/supplier-contracts/account`
- `/api/supplier-contracts/account-dashboard`
- `/api/system/backups/cron`

## 疑似不在菜单/权限表的页面

- `/cost-estimation/bid/history`
- `/cost-estimation/bid/import`
- `/cost-estimation/bid/new`
- `/cost-estimation/import`
- `/knowledge/monthly/new`
- `/knowledge/new`
- `/reports/monthly/fill`
