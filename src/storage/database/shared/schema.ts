import { pgTable, serial, timestamp, index, foreignKey, pgPolicy, integer, varchar, numeric, text, date, unique, jsonb, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const workItems = pgTable("work_items", {
	id: serial().primaryKey().notNull(),
	projectId: integer("project_id").notNull(),
	itemName: varchar("item_name", { length: 200 }).notNull(),
	unit: varchar({ length: 20 }).notNull(),
	budgetQuantity: numeric("budget_quantity", { precision: 12, scale:  2 }).notNull(),
	unitPrice: numeric("unit_price", { precision: 12, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("work_items_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "work_items_project_id_projects_id_fk"
		}).onDelete("cascade"),
	pgPolicy("work_items_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("work_items_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("work_items_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("work_items_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workItemProgress = pgTable("work_item_progress", {
	id: serial().primaryKey().notNull(),
	workItemId: integer("work_item_id").notNull(),
	completedQuantity: numeric("completed_quantity", { precision: 12, scale:  2 }).notNull(),
	recordDate: timestamp("record_date", { withTimezone: true, mode: 'string' }).notNull(),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("work_item_progress_record_date_idx").using("btree", table.recordDate.asc().nullsLast().op("timestamptz_ops")),
	index("work_item_progress_work_item_id_idx").using("btree", table.workItemId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.id],
			name: "work_item_progress_work_item_id_work_items_id_fk"
		}).onDelete("cascade"),
	pgPolicy("work_item_progress_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("work_item_progress_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("work_item_progress_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("work_item_progress_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const clientPayments = pgTable("client_payments", {
	id: serial().primaryKey().notNull(),
	projectId: integer("project_id").notNull(),
	paymentAmount: numeric("payment_amount", { precision: 12, scale:  2 }).notNull(),
	paymentDate: timestamp("payment_date", { withTimezone: true, mode: 'string' }).notNull(),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	paymentMethod: varchar("payment_method", { length: 20 }).default('bank_transfer'),
	status: varchar({ length: 20 }).default('completed'),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: varchar("reviewed_by", { length: 100 }),
}, (table) => [
	index("client_payments_payment_date_idx").using("btree", table.paymentDate.asc().nullsLast().op("timestamptz_ops")),
	index("client_payments_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "client_payments_project_id_projects_id_fk"
		}).onDelete("cascade"),
	pgPolicy("client_payments_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("client_payments_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("client_payments_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("client_payments_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const clientReports = pgTable("client_reports", {
	id: serial().primaryKey().notNull(),
	projectId: integer("project_id").notNull(),
	reportAmount: numeric("report_amount", { precision: 12, scale:  2 }).notNull(),
	reportDate: timestamp("report_date", { withTimezone: true, mode: 'string' }).notNull(),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	workContent: varchar("work_content", { length: 200 }),
	quantity: numeric({ precision: 12, scale:  2 }),
	unit: varchar({ length: 20 }),
	unitPrice: numeric("unit_price", { precision: 12, scale:  2 }),
	settlementAmount: numeric("settlement_amount", { precision: 14, scale:  2 }),
	invoiceAmount: numeric("invoice_amount", { precision: 14, scale:  2 }),
	deductionAmount: numeric("deduction_amount", { precision: 14, scale:  2 }),
	proportionalPayment: numeric("proportional_payment", { precision: 14, scale:  2 }),
	taxRate: numeric("tax_rate", { precision: 5, scale:  2 }).default('9'),
	status: varchar({ length: 20 }).default('draft'), // draft: 草稿, reviewed: 已审核, voided: 已作废
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: varchar("reviewed_by", { length: 100 }),
}, (table) => [
	index("client_reports_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("client_reports_report_date_idx").using("btree", table.reportDate.asc().nullsLast().op("timestamptz_ops")),
	index("client_reports_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "client_reports_project_id_projects_id_fk"
		}).onDelete("cascade"),
	pgPolicy("client_reports_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("client_reports_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("client_reports_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("client_reports_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workerSalaries = pgTable("worker_salaries", {
	id: serial().primaryKey().notNull(),
	workerId: integer("worker_id").notNull(),
	projectId: integer("project_id"),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	yearMonth: varchar("year_month", { length: 7 }).notNull(),
	workHours: numeric("work_hours", { precision: 10, scale:  2 }).default('0'),
	hourlyRate: numeric("hourly_rate", { precision: 10, scale:  2 }).default('0'),
	contractWorkPay: numeric("contract_work_pay", { precision: 12, scale:  2 }).default('0'),
	grossPay: numeric("gross_pay", { precision: 12, scale:  2 }).notNull(),
	incomeTax: numeric("income_tax", { precision: 10, scale:  2 }).default('0'),
	advancePay: numeric("advance_pay", { precision: 10, scale:  2 }).default('0'),
	laborInsurance: numeric("labor_insurance", { precision: 10, scale:  2 }).default('0'),
	fine: numeric("fine", { precision: 10, scale:  2 }).default('0'),
	netPay: numeric("net_pay", { precision: 12, scale:  2 }).notNull(),
	paymentStatus: varchar("payment_status", { length: 20 }).default('unpaid'), // unpaid: 未发放, partial: 部分发放, paid: 已发放
}, (table) => [
	index("worker_salaries_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("worker_salaries_worker_id_idx").using("btree", table.workerId.asc().nullsLast().op("int4_ops")),
	index("worker_salaries_year_month_idx").using("btree", table.yearMonth.asc().nullsLast().op("text_ops")),
	index("worker_salaries_payment_status_idx").using("btree", table.paymentStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workerId],
			foreignColumns: [workers.id],
			name: "worker_salaries_worker_id_workers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "worker_salaries_project_id_projects_id_fk"
		}).onDelete("cascade"),
	pgPolicy("worker_salaries_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("worker_salaries_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("worker_salaries_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("worker_salaries_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workers = pgTable("workers", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	workType: varchar("work_type", { length: 50 }),
	phone: varchar({ length: 20 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	idCard: varchar("id_card", { length: 18 }),
	bankCard: varchar("bank_card", { length: 30 }),
	gender: varchar({ length: 10 }),
	age: integer(),
	entryDate: varchar("entry_date", { length: 20 }),
	teamName: varchar("team_name", { length: 100 }),
	isBlacklist: boolean("is_blacklist").default(false),
	remark: text(),
	projectId: integer("project_id"),
	status: varchar({ length: 20 }).default('in_service'), // in_service: 在场, left: 退场
	leftAt: timestamp("left_at", { withTimezone: true, mode: 'string' }), // 退场时间
}, (table) => [
	index("workers_id_card_idx").using("btree", table.idCard.asc().nullsLast().op("text_ops")),
	index("workers_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("workers_phone_idx").using("btree", table.phone.asc().nullsLast().op("text_ops")),
	index("workers_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("workers_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "workers_project_id_fkey"
		}).onDelete("set null"),
	pgPolicy("workers_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("workers_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("workers_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("workers_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const projects = pgTable("projects", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	year: integer().notNull(),
	status: varchar({ length: 20 }).default('进行中').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	address: varchar({ length: 500 }),
	partner: varchar({ length: 200 }),
	contractAmount: numeric("contract_amount", { precision: 14, scale:  2 }),
	icon: varchar({ length: 50 }).default('HardHat'),
	buildingArea: numeric("building_area", { precision: 12, scale:  2 }), // 建筑面积（平方米）
	taxRate: numeric("tax_rate", { precision: 5, scale:  2 }), // 税率（%）
	expectedCompletionDate: date("expected_completion_date"), // 预计完工日期
}, (table) => [
	index("projects_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("projects_year_idx").using("btree", table.year.asc().nullsLast().op("int4_ops")),
	pgPolicy("projects_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("projects_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("projects_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("projects_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workerAssignments = pgTable("worker_assignments", {
	id: serial().primaryKey().notNull(),
	workerId: integer("worker_id").notNull(),
	projectId: integer("project_id").notNull(),
	startDate: varchar("start_date", { length: 20 }),
	endDate: varchar("end_date", { length: 20 }),
	status: varchar({ length: 20 }).default('active'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("worker_assignments_worker_project_key").on(table.workerId, table.projectId),
	index("worker_assignments_worker_id_idx").using("btree", table.workerId.asc().nullsLast().op("int4_ops")),
	index("worker_assignments_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("worker_assignments_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workerId],
			foreignColumns: [workers.id],
			name: "worker_assignments_worker_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "worker_assignments_project_id_fkey"
		}).onDelete("cascade"),
]);

export const salaryPayments = pgTable("salary_payments", {
	id: serial().primaryKey().notNull(),
	salaryId: integer("salary_id"),
	workerId: integer("worker_id").notNull(),
	projectId: integer("project_id"),
	yearMonth: varchar("year_month", { length: 7 }),
	paymentAmount: numeric("payment_amount", { precision: 12, scale:  2 }).notNull(),
	paymentDate: varchar("payment_date", { length: 20 }).notNull(),
	paymentType: varchar("payment_type", { length: 20 }).default('甲方代付'),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("salary_payments_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("salary_payments_salary_id_idx").using("btree", table.salaryId.asc().nullsLast().op("int4_ops")),
	index("salary_payments_worker_id_idx").using("btree", table.workerId.asc().nullsLast().op("int4_ops")),
	index("salary_payments_year_month_idx").using("btree", table.yearMonth.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.salaryId],
			foreignColumns: [workerSalaries.id],
			name: "salary_payments_salary_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workerId],
			foreignColumns: [workers.id],
			name: "salary_payments_worker_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "salary_payments_project_id_fkey"
		}).onDelete("cascade"),
]);

export const workItemSubitems = pgTable("work_item_subitems", {
	id: serial().primaryKey().notNull(),
	workItemId: integer("work_item_id"),
	subitemName: varchar("subitem_name", { length: 200 }).notNull(),
	unit: varchar({ length: 20 }).notNull(),
	budgetQuantity: numeric("budget_quantity", { precision: 12, scale:  2 }).notNull(),
	completedQuantity: numeric("completed_quantity", { precision: 12, scale:  2 }).default('0'),
	unitPrice: numeric("unit_price", { precision: 12, scale:  2 }),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	projectId: integer("project_id"),
	contractPrice: numeric("contract_price", { precision: 12, scale:  2 }),
	limitPrice: numeric("limit_price", { precision: 12, scale:  2 }),
}, (table) => [
	index("idx_work_item_subitems_project_id").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("work_item_subitems_work_item_id_idx").using("btree", table.workItemId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.id],
			name: "work_item_subitems_work_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "work_item_subitems_project_id_fkey"
		}),
	pgPolicy("work_item_subitems_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("work_item_subitems_允许公开更新", { as: "permissive", for: "update", to: ["public"], using: sql`true`, withCheck: sql`true` }),
	pgPolicy("work_item_subitems_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true` }),
	pgPolicy("work_item_subitems_允许公开读取", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);

// 月度对上报量表（独立于对下结算量）
export const subitemMonthlyReports = pgTable("subitem_monthly_reports", {
	id: serial().primaryKey().notNull(),
	subitemId: integer("subitem_id").notNull(),
	yearMonth: varchar("year_month", { length: 7 }).notNull(), // 格式: YYYY-MM
	reportQuantity: numeric("report_quantity", { precision: 12, scale:  2 }).notNull(), // 当月对上报量
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("subitem_monthly_reports_subitem_id_idx").using("btree", table.subitemId.asc().nullsLast().op("int4_ops")),
	index("subitem_monthly_reports_year_month_idx").using("btree", table.yearMonth.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.subitemId],
			foreignColumns: [workItemSubitems.id],
			name: "subitem_monthly_reports_subitem_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("subitem_monthly_reports_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("subitem_monthly_reports_允许公开更新", { as: "permissive", for: "update", to: ["public"], using: sql`true`, withCheck: sql`true` }),
	pgPolicy("subitem_monthly_reports_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true` }),
	pgPolicy("subitem_monthly_reports_允许公开读取", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);

// 月度对下结算量表
export const subitemMonthlyProgress = pgTable("subitem_monthly_progress", {
	id: serial().primaryKey().notNull(),
	subitemId: integer("subitem_id").notNull(),
	yearMonth: varchar("year_month", { length: 7 }).notNull(), // 格式: YYYY-MM
	completedQuantity: numeric("completed_quantity", { precision: 12, scale:  2 }).notNull(), // 当月完成量
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("subitem_monthly_progress_subitem_id_idx").using("btree", table.subitemId.asc().nullsLast().op("int4_ops")),
	index("subitem_monthly_progress_year_month_idx").using("btree", table.yearMonth.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.subitemId],
			foreignColumns: [workItemSubitems.id],
			name: "subitem_monthly_progress_subitem_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("subitem_monthly_progress_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("subitem_monthly_progress_允许公开更新", { as: "permissive", for: "update", to: ["public"], using: sql`true`, withCheck: sql`true` }),
	pgPolicy("subitem_monthly_progress_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true` }),
	pgPolicy("subitem_monthly_progress_允许公开读取", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);

export const suppliers = pgTable("suppliers", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	type: varchar({ length: 50 }).notNull(),
	contactPerson: varchar("contact_person", { length: 100 }),
	phone: varchar({ length: 50 }),
	bankName: varchar("bank_name", { length: 100 }),
	bankAccount: varchar("bank_account", { length: 100 }),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const settlements = pgTable("settlements", {
	id: serial().primaryKey().notNull(),
	supplierId: integer("supplier_id").notNull(),
	projectId: integer("project_id"),
	settlementType: varchar("settlement_type", { length: 100 }),
	settlementContent: text("settlement_content"),
	settlementQuantity: numeric("settlement_quantity", { precision: 12, scale:  2 }),
	settlementUnit: varchar("settlement_unit", { length: 50 }),
	settlementAmount: numeric("settlement_amount", { precision: 12, scale:  2 }).notNull(),
	settlementMonth: varchar("settlement_month", { length: 7 }).notNull(),
	settlementDate: date("settlement_date"),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_settlements_month").using("btree", table.settlementMonth.asc().nullsLast().op("text_ops")),
	index("idx_settlements_project_id").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("idx_settlements_supplier_id").using("btree", table.supplierId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "settlements_supplier_id_fkey"
		}),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "settlements_project_id_fkey"
		}),
]);

export const payments = pgTable("payments", {
	id: serial().primaryKey().notNull(),
	supplierId: integer("supplier_id").notNull(),
	projectId: integer("project_id"),
	paymentAmount: numeric("payment_amount", { precision: 12, scale:  2 }).notNull(),
	paymentDate: date("payment_date").notNull(),
	paymentMethod: varchar("payment_method", { length: 50 }),
	voucherNumber: varchar("voucher_number", { length: 100 }),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_payments_date").using("btree", table.paymentDate.asc().nullsLast().op("date_ops")),
	index("idx_payments_project_id").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("idx_payments_supplier_id").using("btree", table.supplierId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "payments_supplier_id_fkey"
		}),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "payments_project_id_fkey"
		}),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: varchar({ length: 50 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	role: varchar({ length: 20 }).default('admin'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }),
	// 钉钉绑定字段
	dingtalkUserId: varchar("dingtalk_user_id", { length: 100 }),
	dingtalkUnionId: varchar("dingtalk_union_id", { length: 100 }),
	dingtalkMobile: varchar("dingtalk_mobile", { length: 30 }),
	dingtalkName: varchar("dingtalk_name", { length: 100 }),
	dingtalkDeptId: varchar("dingtalk_dept_id", { length: 100 }),
	dingtalkAvatar: text("dingtalk_avatar"),
	dingtalkActive: boolean("dingtalk_active").default(false),
	lastDingtalkSyncAt: timestamp("last_dingtalk_sync_at", { withTimezone: true, mode: 'string' }),
		isDisabled: boolean("is_disabled").default(false),
}, (table) => [
	unique("users_username_key").on(table.username),
	unique("users_dingtalk_user_id_key").on(table.dingtalkUserId),
]);

// 证件管理表
export const certificates = pgTable("certificates", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(), // 证件名称
	certificateNumber: varchar("certificate_number", { length: 100 }).notNull(), // 证件编号
	ownerType: varchar("owner_type", { length: 20 }).notNull(), // 归属类型：company/personnel
	ownerName: varchar("owner_name", { length: 200 }).notNull(), // 关联人员/公司名称
	issueDate: date("issue_date").notNull(), // 发证日期
	expiryDate: date("expiry_date").notNull(), // 到期日期
	remark: text(), // 备注说明
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("certificates_owner_type_idx").using("btree", table.ownerType.asc().nullsLast().op("text_ops")),
	index("certificates_expiry_date_idx").using("btree", table.expiryDate.asc().nullsLast().op("date_ops")),
	pgPolicy("certificates_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("certificates_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("certificates_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("certificates_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

// 工人导入历史表
export const workerImportHistory = pgTable("worker_import_history", {
	id: serial().primaryKey().notNull(),
	importTime: timestamp("import_time", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	fileName: varchar("file_name", { length: 255 }),
	totalCount: integer("total_count").default(0),
	successCount: integer("success_count").default(0),
	updateCount: integer("update_count").default(0),
	skipCount: integer("skip_count").default(0),
	errorCount: integer("error_count").default(0),
	importMode: varchar("import_mode", { length: 20 }).default('insert_only'),
	operator: varchar({ length: 100 }),
	errorDetails: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("worker_import_history_import_time_idx").using("btree", table.importTime.desc().nullsLast().op("timestamptz_ops")),
	pgPolicy("worker_import_history_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("worker_import_history_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("worker_import_history_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

// WPS 花名册同步日志
export const wpsWorkerSyncLogs = pgTable("wps_worker_sync_logs", {
	id: serial().primaryKey().notNull(),
	source: varchar({ length: 30 }).default('wps'),
	projectId: integer("project_id"),
	projectName: varchar("project_name", { length: 200 }),
	worksheetName: varchar("worksheet_name", { length: 200 }),
	workerId: integer("worker_id"),
	workerName: varchar("worker_name", { length: 100 }),
	idCard: varchar("id_card", { length: 18 }),
	phone: varchar({ length: 30 }),
	action: varchar({ length: 30 }).notNull(),
	status: varchar({ length: 20 }).notNull(),
	message: text(),
	sanitizedFields: jsonb("sanitized_fields"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("wps_worker_sync_logs_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamptz_ops")),
	index("wps_worker_sync_logs_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("wps_worker_sync_logs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "wps_worker_sync_logs_project_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.workerId],
			foreignColumns: [workers.id],
			name: "wps_worker_sync_logs_worker_id_fkey"
	}).onDelete("set null"),
]);

// 消息通知表
export const wpsProjectBindings = pgTable("wps_project_bindings", {
	id: serial().primaryKey().notNull(),
	projectId: integer("project_id").notNull(),
	wpsProjectName: varchar("wps_project_name", { length: 200 }),
	worksheetName: varchar("worksheet_name", { length: 200 }),
	wpsFormId: varchar("wps_form_id", { length: 120 }),
	wpsSheetId: varchar("wps_sheet_id", { length: 120 }),
	wpsTableId: varchar("wps_table_id", { length: 120 }),
	isActive: boolean("is_active").default(true),
	remark: text(),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }),
	lastSyncStatus: varchar("last_sync_status", { length: 20 }),
	lastSyncMessage: text("last_sync_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("wps_project_bindings_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("wps_project_bindings_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("wps_project_bindings_form_id_idx").using("btree", table.wpsFormId.asc().nullsLast().op("text_ops")),
	index("wps_project_bindings_sheet_id_idx").using("btree", table.wpsSheetId.asc().nullsLast().op("text_ops")),
	index("wps_project_bindings_table_id_idx").using("btree", table.wpsTableId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "wps_project_bindings_project_id_fkey"
	}).onDelete("cascade"),
]);

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	type: varchar({ length: 50 }).notNull(), // 通知类型
	title: varchar({ length: 200 }).notNull(), // 标题
	content: text(), // 内容
	severity: varchar({ length: 20 }).default('info'), // info/warning/danger
	priority: integer("priority").default(0), // 优先级：0=普通, 1=重要, 2=紧急
	isRead: varchar("is_read", { length: 5 }).default('false'), // 是否已读
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }), // 阅读时间
	projectId: integer("project_id"), // 关联项目ID
	relatedId: integer("related_id"), // 关联记录ID
	relatedType: varchar("related_type", { length: 50 }), // 关联记录类型
	recipientUserId: integer("recipient_user_id"), // 接收人ID
	recipientRole: varchar("recipient_role", { length: 50 }), // 接收角色
	metadata: text(), // 元数据（JSON）
	isSent: varchar("is_sent", { length: 5 }).default('false'), // 是否已发送钉钉
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }), // 发送时间
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("notifications_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("notifications_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("notifications_recipient_user_id_idx").using("btree", table.recipientUserId.asc().nullsLast().op("int4_ops")),
	index("notifications_recipient_role_idx").using("btree", table.recipientRole.asc().nullsLast().op("text_ops")),
	index("notifications_is_read_idx").using("btree", table.isRead.asc().nullsLast().op("text_ops")),
	index("notifications_priority_idx").using("btree", table.priority.desc().nullsLast().op("int4_ops")),
	index("notifications_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamptz_ops")),
]);

// 通知设置表
export const notificationSettings = pgTable("notification_settings", {
	id: serial().primaryKey().notNull(),
	settingKey: varchar("setting_key", { length: 100 }).notNull(), // 设置键名
	settingValue: text("setting_value"), // 设置值
	description: text(), // 描述
	enabled: varchar({ length: 5 }).default('true'), // 是否启用
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 供应商合同表
export const supplierContracts = pgTable("supplier_contracts", {
	id: serial().primaryKey().notNull(),
	supplierId: integer("supplier_id").notNull(), // 供应商ID
	projectId: integer("project_id"), // 项目ID
	contractName: varchar("contract_name", { length: 200 }), // 合同名称
	contractNo: varchar("contract_no", { length: 50 }), // 合同编号
	contractAmount: numeric("contract_amount", { precision: 14, scale: 2 }), // 合同金额
	totalAmount: numeric("total_amount", { precision: 14, scale: 2 }), // 合同总额
	settlementAmount: numeric("settlement_amount", { precision: 14, scale: 2 }), // 结算金额
	contractDate: date("contract_date"), // 签约日期
	contractStatus: varchar("contract_status", { length: 20 }).default('履约中'), // 履约中: active, 已完结: completed, 已终止: terminated
	paymentRatioActive: numeric("payment_ratio_active", { precision: 5, scale: 2 }).default('80'), // 进度付款比例%
	paymentRatioComplete: numeric("payment_ratio_complete", { precision: 5, scale: 2 }).default('95'), // 完工付款比例%
	paymentRatioFinal: numeric("payment_ratio_final", { precision: 5, scale: 2 }).default('100'), // 决算付款比例%
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("supplier_contracts_supplier_id_idx").using("btree", table.supplierId.asc().nullsLast().op("int4_ops")),
	index("supplier_contracts_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("supplier_contracts_contract_status_idx").using("btree", table.contractStatus.asc().nullsLast().op("text_ops")),
]);

// 供应商结算表
export const supplierSettlements = pgTable("supplier_settlements", {
	id: serial().primaryKey().notNull(),
	contractId: integer("contract_id"), // 合同ID
	settlementDate: date("settlement_date"), // 结算日期
	settlementType: varchar("settlement_type", { length: 50 }), // 结算类型：progress/milestone/final
	settlementAmount: numeric("settlement_amount", { precision: 14, scale: 2 }), // 结算金额
	invoiceAmount: numeric("invoice_amount", { precision: 14, scale: 2 }), // 开票金额
	taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }), // 税额
	payableAmount: numeric("payable_amount", { precision: 14, scale: 2 }), // 应付金额 = 结算金额 × 付款比例
	settlementNo: varchar("settlement_no", { length: 50 }), // 结算单号
	status: varchar({ length: 20 }).default('draft'), // draft: 草稿, reviewed: 已审核, voided: 已作废
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: varchar("reviewed_by", { length: 100 }),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("supplier_settlements_contract_id_idx").using("btree", table.contractId.asc().nullsLast().op("int4_ops")),
	index("supplier_settlements_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

// 供应商付款表
export const supplierPayments = pgTable("supplier_payments", {
	id: serial().primaryKey().notNull(),
	supplierId: integer("supplier_id").notNull(), // 供应商ID
	projectId: integer("project_id"), // 项目ID
	contractId: integer("contract_id"), // 合同ID
	settlementId: integer("settlement_id"), // 结算单ID
	paymentAmount: numeric("payment_amount", { precision: 14, scale: 2 }).notNull(), // 付款金额
	paymentDate: date("payment_date"), // 付款日期
	paymentMethod: varchar("payment_method", { length: 50 }), // 付款方式
	paymentNo: varchar("payment_no", { length: 50 }), // 付款单号
	paymentType: varchar("payment_type", { length: 20 }).default('progress'), // 付款类型：progress/milestone/final
	status: varchar({ length: 20 }).default('completed'), // completed/pending
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("supplier_payments_supplier_id_idx").using("btree", table.supplierId.asc().nullsLast().op("int4_ops")),
	index("supplier_payments_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("supplier_payments_contract_id_idx").using("btree", table.contractId.asc().nullsLast().op("int4_ops")),
]);

// 综合费用表
export const comprehensiveExpenses = pgTable("comprehensive_expenses", {
	id: serial().primaryKey().notNull(),
	projectId: integer("project_id"),
	expenseType: varchar("expense_type", { length: 50 }).notNull(),
	amount: numeric({ precision: 12, scale: 2 }).notNull(),
	expenseDate: date("expense_date").notNull(),
	handler: varchar({ length: 100 }),
	remark: text(),
	attachments: text(),
	createdBy: varchar("created_by", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	status: varchar({ length: 20 }).default('draft'), // draft: 草稿, reviewed: 已审核, voided: 已作废
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: varchar("reviewed_by", { length: 100 }),
}, (table) => [
	index("comprehensive_expenses_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("comprehensive_expenses_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

// 零星材料表
export const miscellaneousMaterials = pgTable("miscellaneous_materials", {
	id: serial().primaryKey().notNull(),
	projectId: integer("project_id").notNull(),
	materialName: varchar("material_name", { length: 200 }).notNull(),
	specification: varchar({ length: 100 }),
	unit: varchar({ length: 20 }),
	quantity: numeric({ precision: 12, scale: 2 }).notNull(),
	unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
	amount: numeric({ precision: 12, scale: 2 }).notNull(),
	purchaseDate: date("purchase_date").notNull(),
	purchaser: varchar({ length: 100 }),
	remark: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: varchar({ length: 20 }).default('draft'), // draft: 草稿, reviewed: 已审核, voided: 已作废
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: varchar("reviewed_by", { length: 100 }),
}, (table) => [
	index("miscellaneous_materials_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("miscellaneous_materials_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const monthlyReportSnapshots = pgTable("monthly_report_snapshots", {
	id: serial().primaryKey(),
	reportMonth: varchar("report_month", { length: 7 }).notNull(),
	projectScope: varchar("project_scope", { length: 20 }).default('all').notNull(),
	projectIds: integer("project_ids").array(),
	templateType: varchar("template_type", { length: 30 }).default('summary').notNull(),
	dataSnapshot: jsonb("data_snapshot").default({}).notNull(),
	pdfUrl: text("pdf_url"),
	generatedBy: varchar("generated_by", { length: 100 }),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("monthly_report_snapshots_month_idx").using("btree", table.reportMonth.asc().nullsLast().op("text_ops")),
]);

// 钉钉通讯录缓存表
export const dingtalkContacts = pgTable("dingtalk_contacts", {
	id: serial().primaryKey().notNull(),
	dingtalkUserId: varchar("dingtalk_user_id", { length: 100 }).notNull(),
	unionId: varchar("union_id", { length: 100 }),
	name: varchar({ length: 100 }).notNull(),
	mobile: varchar({ length: 30 }),
	deptIdList: varchar("dept_id_list", { length: 500 }),
	deptNameList: varchar("dept_name_list", { length: 500 }),
	avatar: text(),
	active: boolean().default(true),
	title: varchar({ length: 100 }),
	syncTime: timestamp("sync_time", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dingtalk_contacts_mobile_idx").using("btree", table.mobile.asc().nullsLast().op("text_ops")),
	index("dingtalk_contacts_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("dingtalk_contacts_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
]);

// 钉钉安全日志表
export const dingtalkSecurityLogs = pgTable("dingtalk_security_logs", {
	id: serial().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	dingtalkUserId: varchar("dingtalk_user_id", { length: 100 }),
	dingtalkName: varchar("dingtalk_name", { length: 100 }),
	systemUserId: integer("system_user_id"),
	systemUsername: varchar("system_username", { length: 100 }),
	ipAddress: varchar("ip_address", { length: 50 }),
	userAgent: text("user_agent"),
	result: varchar("result", { length: 20 }).notNull(),
	errorMessage: text("error_message"),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dingtalk_security_logs_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("dingtalk_security_logs_system_user_id_idx").using("btree", table.systemUserId.asc().nullsLast().op("int8_ops")),
	index("dingtalk_security_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("text_ops")),
	]);

// ========== AI 劳务助手相关表 ==========

// AI 全局配置表
export const aiConfigs = pgTable("ai_configs", {
	id: serial().primaryKey().notNull(),
	// 大模型配置
	modelId: varchar("model_id", { length: 100 }).default('doubao-seed-2-0-lite-260215').notNull(),
	apiEndpoint: text("api_endpoint"),
	apiKey: varchar("api_key", { length: 500 }),
	// 会话配置
	maxContextLength: integer("max_context_length").default(20).notNull(),
	dailyLimit: integer("daily_limit").default(100).notNull(),
	temperature: numeric("temperature", { precision: 3, scale: 2 }).default('0.70').notNull(),
	// 全局开关
	enabled: boolean().default(true).notNull(),
	// 分模块开关
	moduleDataQuery: boolean("module_data_query").default(true).notNull(),
	moduleReportAnalysis: boolean("module_report_analysis").default(true).notNull(),
	moduleErrorDiagnosis: boolean("module_error_diagnosis").default(true).notNull(),
	moduleDocGeneration: boolean("module_doc_generation").default(true).notNull(),
	moduleSupplierAnalysis: boolean("module_supplier_analysis").default(true).notNull(),
	moduleSalaryAnalysis: boolean("module_salary_analysis").default(true).notNull(),
	moduleVisaAssistant: boolean("module_visa_assistant").default(true).notNull(),
	// 违规拦截
	contentFilterEnabled: boolean("content_filter_enabled").default(true).notNull(),
	// 脱敏
	maskSensitive: boolean("mask_sensitive").default(true).notNull(),
	// 离线兜底
	offlineFallbackEnabled: boolean("offline_fallback_enabled").default(true).notNull(),
	// 审计
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// AI 知识库文档表
export const aiKnowledgeDocs = pgTable("ai_knowledge_docs", {
	id: serial().primaryKey().notNull(),
	title: varchar({ length: 200 }).notNull(),
	category: varchar({ length: 50 }).notNull(), // regulation/policy/template/field_dict/business_data
	sourceType: varchar("source_type", { length: 30 }).notNull(), // upload/sync/url
	sourceRef: text("source_ref"), // 文件key或数据表名
	content: text().notNull(),
	fileKey: text("file_key"), // 对象存储key
	fileName: varchar("file_name", { length: 300 }),
	fileSize: integer("file_size"),
	chunkCount: integer("chunk_count").default(0).notNull(),
	status: varchar({ length: 20 }).default('active').notNull(), // active/indexing/error
	errorMessage: text("error_message"),
	datasetName: varchar("dataset_name", { length: 100 }).default('labor_ai_kb'),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_knowledge_docs_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("ai_knowledge_docs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

// AI 对话历史表
export const aiChatHistories = pgTable("ai_chat_histories", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 50 }).notNull(),
	userId: integer("user_id").notNull(),
	username: varchar({ length: 100 }),
	role: varchar({ length: 20 }).notNull(), // user/assistant/system
	content: text().notNull(),
	pageContext: varchar("page_context", { length: 200 }), // 发起对话时所在页面
	modelId: varchar("model_id", { length: 100 }),
	tokenCount: integer("token_count").default(0),
	isMasked: boolean("is_masked").default(false), // 是否经过脱敏处理
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_chat_histories_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("ai_chat_histories_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	index("ai_chat_histories_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("text_ops")),
]);

// AI 审计日志表
export const aiAuditLogs = pgTable("ai_audit_logs", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	username: varchar({ length: 100 }),
	action: varchar({ length: 50 }).notNull(), // chat/query/generate_doc/analyze/config_change
	inputSummary: text("input_summary"), // 用户输入摘要（前200字）
	outputSummary: text("output_summary"), // AI输出摘要
	pageContext: varchar("page_context", { length: 200 }),
	modelId: varchar("model_id", { length: 100 }),
	tokenUsage: integer("token_usage").default(0),
	responseTimeMs: integer("response_time_ms").default(0),
	isSuccess: boolean("is_success").default(true).notNull(),
	errorMessage: text("error_message"),
	ipAddress: varchar("ip_address", { length: 50 }),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_audit_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	index("ai_audit_logs_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("ai_audit_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("text_ops")),
]);

// AI 每日调用统计表
export const aiDailyUsage = pgTable("ai_daily_usage", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	usageDate: varchar("usage_date", { length: 10 }).notNull(), // YYYY-MM-DD
	requestCount: integer("request_count").default(0).notNull(),
	tokenTotal: integer("token_total").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("ai_daily_usage_user_date_key").on(table.userId, table.usageDate),
		index("ai_daily_usage_date_idx").using("btree", table.usageDate.asc().nullsLast().op("text_ops")),
	]);

	// 施工日志表
	export const constructionLogs = pgTable("construction_logs", {
		id: serial().primaryKey().notNull(),
		projectId: integer("project_id").notNull(),
		userId: integer("user_id").notNull(),
		userName: varchar("user_name", { length: 100 }),
		logDate: varchar("log_date", { length: 10 }).notNull(), // YYYY-MM-DD
		location: varchar({ length: 200 }), // 施工部位
		content: text().notNull(), // 施工内容
		headcount: integer(), // 出勤人数
		issues: text(), // 异常/问题
		createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	}, (table) => [
		index("construction_logs_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
		index("construction_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
		index("construction_logs_log_date_idx").using("btree", table.logDate.asc().nullsLast().op("text_ops")),
	]);

export const constructionDailyReports = pgTable("construction_daily_reports", {
		id: serial().primaryKey().notNull(),
		reportDate: varchar("report_date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
		summary: jsonb().notNull(), // ConstructionDailyReportSummary
		content: text(), // 报告内容
		aiSummary: text("ai_summary"), // AI 生成的摘要
		aiStatus: varchar("ai_status", { length: 20 }).default('pending'), // pending/processing/completed/failed
		generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }),
		pushedAt: timestamp("pushed_at", { withTimezone: true, mode: 'string' }),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	}, (table) => [
		index("construction_daily_reports_report_date_idx").using("btree", table.reportDate.asc().nullsLast().op("text_ops")),
		index("construction_daily_reports_ai_status_idx").using("btree", table.aiStatus.asc().nullsLast().op("text_ops")),
	]);
