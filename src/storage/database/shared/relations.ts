import { relations } from "drizzle-orm/relations";
import { projects, workItems, workItemProgress, clientPayments, clientReports, workers, workerSalaries, salaryPayments, workItemSubitems, suppliers, settlements, payments } from "./schema";

export const workItemsRelations = relations(workItems, ({one, many}) => ({
	project: one(projects, {
		fields: [workItems.projectId],
		references: [projects.id]
	}),
	workItemProgresses: many(workItemProgress),
	workItemSubitems: many(workItemSubitems),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	workItems: many(workItems),
	clientPayments: many(clientPayments),
	clientReports: many(clientReports),
	workerSalaries: many(workerSalaries),
	workers: many(workers),
	salaryPayments: many(salaryPayments),
	workItemSubitems: many(workItemSubitems),
	settlements: many(settlements),
	payments: many(payments),
}));

export const workItemProgressRelations = relations(workItemProgress, ({one}) => ({
	workItem: one(workItems, {
		fields: [workItemProgress.workItemId],
		references: [workItems.id]
	}),
}));

export const clientPaymentsRelations = relations(clientPayments, ({one}) => ({
	project: one(projects, {
		fields: [clientPayments.projectId],
		references: [projects.id]
	}),
}));

export const clientReportsRelations = relations(clientReports, ({one}) => ({
	project: one(projects, {
		fields: [clientReports.projectId],
		references: [projects.id]
	}),
}));

export const workerSalariesRelations = relations(workerSalaries, ({one, many}) => ({
	worker: one(workers, {
		fields: [workerSalaries.workerId],
		references: [workers.id]
	}),
	project: one(projects, {
		fields: [workerSalaries.projectId],
		references: [projects.id]
	}),
	salaryPayments: many(salaryPayments),
}));

export const workersRelations = relations(workers, ({one, many}) => ({
	workerSalaries: many(workerSalaries),
	project: one(projects, {
		fields: [workers.projectId],
		references: [projects.id]
	}),
	salaryPayments: many(salaryPayments),
}));

export const salaryPaymentsRelations = relations(salaryPayments, ({one}) => ({
	workerSalary: one(workerSalaries, {
		fields: [salaryPayments.salaryId],
		references: [workerSalaries.id]
	}),
	worker: one(workers, {
		fields: [salaryPayments.workerId],
		references: [workers.id]
	}),
	project: one(projects, {
		fields: [salaryPayments.projectId],
		references: [projects.id]
	}),
}));

export const workItemSubitemsRelations = relations(workItemSubitems, ({one}) => ({
	workItem: one(workItems, {
		fields: [workItemSubitems.workItemId],
		references: [workItems.id]
	}),
	project: one(projects, {
		fields: [workItemSubitems.projectId],
		references: [projects.id]
	}),
}));

export const settlementsRelations = relations(settlements, ({one}) => ({
	supplier: one(suppliers, {
		fields: [settlements.supplierId],
		references: [suppliers.id]
	}),
	project: one(projects, {
		fields: [settlements.projectId],
		references: [projects.id]
	}),
}));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	settlements: many(settlements),
	payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({one}) => ({
	supplier: one(suppliers, {
		fields: [payments.supplierId],
		references: [suppliers.id]
	}),
	project: one(projects, {
		fields: [payments.projectId],
		references: [projects.id]
	}),
}));