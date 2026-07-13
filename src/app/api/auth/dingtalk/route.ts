/**
 * 兼容旧钉钉免登 API。
 *
 * 实际免登逻辑统一维护在 /api/auth/dingtalk/login，避免两个入口出现
 * 账号创建、待分配状态、权限写入 token 等规则不一致。
 */

export { POST } from './login/route';
