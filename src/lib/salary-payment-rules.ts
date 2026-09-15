/**
 * 工资发放状态的统一金额口径。
 *
 * 实发工资与已发工资的绝对差值不超过 3 元时，视为已发清。
 * 该模块只放纯常量，前端页面和服务端 API 都可以安全复用。
 */
export const SALARY_PAYMENT_TOLERANCE = 3;
