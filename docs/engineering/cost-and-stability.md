# 存储成本与稳定性优化清单

## 一、已落地的优化（本轮）

| 项 | 做法 | 效果 |
|---|---|---|
| 首屏 JS 体积 | `experimental.optimizePackageImports` 按需引入 `lucide-react` / `date-fns` / `recharts` | 减少首屏下载量 |
| 构建产物冗余 | 生产构建去掉 `console.log/debug`（保留 error/warn） | 体积更小，且不会把调试信息带到浏览器 |
| 压缩传输 | `compress: true`（gzip/brotli） | 静态与 HTML 传输更小 |
| 安全头 | 关闭 `x-powered-by` | 不暴露框架版本 |
| 大表统计 | 全部统计查询分页取全量 | 数据增长后不会因 1000 行截断而变慢/算错 |

## 二、附件（施工照片）压缩建议

现场照片单张常 3~8MB，OSS 存储与流量是最大成本项。建议在**上传前**用浏览器压缩：

```ts
// 伪代码：上传前压缩到长边 1600px、质量 0.8
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
```

应用到：施工日志附件、签证附件、证件上传、生活费回单（回单是凭证，**不要压缩**，否则 OCR 识别率下降）。

预计效果：照片体积下降 **70%+**，OSS 费用与页面加载同步下降。

## 三、CDN 建议

| 资源 | 现状 | 建议 |
|---|---|---|
| `/_next/static/*` | 已带 hash、可长缓存 | 走 CDN（阿里云 CDN + OSS 源站） |
| 用户附件（OSS） | 阿里云 OSS 直连 | 绑定 CDN 域名，回源 OSS |
| 页面 HTML | 已设置 `no-store` | 保持（避免旧 HTML 引用失效 chunk） |

## 四、历史数据归档（需人工执行）

超过 2 年的施工日志/考勤/工资会拖慢主库。建议按年归档到冷表：

```sql
-- 示例：把 2023 年及以前的施工日志归档（执行前务必备份）
CREATE TABLE IF NOT EXISTS construction_logs_archive (LIKE construction_logs INCLUDING ALL);

INSERT INTO construction_logs_archive
SELECT * FROM construction_logs WHERE log_date < '2024-01-01';

-- 确认归档表行数无误后再删除原表数据
-- DELETE FROM construction_logs WHERE log_date < '2024-01-01';
```

> 归档会改变统计口径（历史数据不再计入），执行前要先确认月报/看板是否需要历史数据。

## 五、监控建议（下一步）

| 项 | 说明 |
|---|---|
| 慢接口统计 | 记录耗时 >1s 的接口路径与耗时，每周看 Top 10 |
| OSS 用量 | 每月看存储量/流量，异常增长先查重复上传 |
| 备份成功率 | 数据备份页已显示；建议接钉钉告警 |
