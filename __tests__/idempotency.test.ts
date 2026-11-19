import { describe, expect, it } from "vitest";
import {
  daysBetween,
  listOverdueForReminder,
  overdueReminderKey,
  recordAutomationLog,
  recordWorkflowFailure,
} from "../convex/automation";
import { fakeDb, handlerOf } from "./helpers";

/*
 * n8n retries write-backs, and a workflow can be re-run by hand. These tests run
 * the real Convex handlers against an in-memory database to show that neither
 * creates a duplicate record or a second reminder.
 */

const log = {
  idempotencyKey: "overdue:req_1:2026-11-19",
  borrowRequestId: "req_1",
  type: "overdue_reminder",
  status: "sent",
  message: "Overdue reminder sent to the borrower (2 days late)",
};

function withRequest() {
  return fakeDb({ borrowRequests: [{ _id: "req_1" }] });
}

describe("activity log write-back", () => {
  it("stores a retried write-back once", async () => {
    const { db, rows } = withRequest();
    const first = await handlerOf(recordAutomationLog)({ db }, log);
    const second = await handlerOf(recordAutomationLog)({ db }, log);
    expect(second).toBe(first);
    expect(rows("automationLogs")).toHaveLength(1);
  });

  it("upgrades a failed reminder to sent when a re-run succeeds, but never the reverse", async () => {
    const { db, rows } = withRequest();
    await handlerOf(recordAutomationLog)({ db }, { ...log, status: "failed", message: "Overdue reminder could not be sent" });
    await handlerOf(recordAutomationLog)({ db }, log);
    expect(rows("automationLogs")).toEqual([expect.objectContaining({ status: "sent", message: log.message })]);

    await handlerOf(recordAutomationLog)({ db }, { ...log, status: "failed", message: "late failure" });
    expect(rows("automationLogs")).toEqual([expect.objectContaining({ status: "sent", message: log.message })]);
  });

  it("refuses logs for borrow requests that don't exist", async () => {
    const { db, rows } = withRequest();
    expect(await handlerOf(recordAutomationLog)({ db }, { ...log, borrowRequestId: "req_unknown" })).toBeNull();
    expect(rows("automationLogs")).toHaveLength(0);
  });
});

describe("overdue reminders", () => {
  function withLoans() {
    return fakeDb({
      users: [
        { _id: "borrower_1", name: "Sam Lee", email: "sam@example.com" },
        { _id: "lender_1", name: "Alex Rivera", email: "alex@example.com" },
      ],
      tools: [{ _id: "tool_1", name: "Cordless drill" }],
      borrowRequests: [
        { _id: "req_1", status: "borrowed", dueDate: "2026-11-17", borrowerId: "borrower_1", lenderId: "lender_1", toolId: "tool_1" },
        { _id: "req_2", status: "borrowed", dueDate: "2026-11-19", borrowerId: "borrower_1", lenderId: "lender_1", toolId: "tool_1" },
        { _id: "req_3", status: "returned", dueDate: "2026-11-01", borrowerId: "borrower_1", lenderId: "lender_1", toolId: "tool_1" },
      ],
    });
  }
  const list = (db: unknown, today: string) =>
    handlerOf(listOverdueForReminder)({ db }, { today }) as Promise<{ requestId: string }[]>;

  it("lists only loans past due, with the borrower's first name and email and nothing about the lender", async () => {
    const { db } = withLoans();
    const loans = await list(db, "2026-11-19");
    expect(loans).toEqual([{
      requestId: "req_1",
      idempotencyKey: "overdue:req_1:2026-11-19",
      borrower: { name: "Sam", email: "sam@example.com" },
      toolName: "Cordless drill",
      dueDate: "2026-11-17",
      daysOverdue: 2,
    }]);
    expect(JSON.stringify(loans)).not.toContain("alex@example.com");
  });

  it("leaves out loans already reminded today, so a re-run sends nothing new", async () => {
    const { db } = withLoans();
    await handlerOf(recordAutomationLog)({ db }, log);
    expect(await list(db, "2026-11-19")).toEqual([]);
  });

  it("lists a loan again if today's reminder failed, and again the next day", async () => {
    const { db } = withLoans();
    await handlerOf(recordAutomationLog)({ db }, { ...log, status: "failed", message: "Overdue reminder could not be sent" });
    expect(await list(db, "2026-11-19")).toHaveLength(1);
    await handlerOf(recordAutomationLog)({ db }, log);
    // The next day brings a new key for req_1, and req_2 (due on the 19th) is now overdue too.
    expect(await list(db, "2026-11-20")).toEqual([
      expect.objectContaining({ idempotencyKey: "overdue:req_1:2026-11-20" }),
      expect.objectContaining({ idempotencyKey: "overdue:req_2:2026-11-20" }),
    ]);
  });

  it("builds one key per loan per day and counts days between dates", () => {
    expect(overdueReminderKey("req_1", "2026-11-19")).toBe(overdueReminderKey("req_1", "2026-11-19"));
    expect(overdueReminderKey("req_1", "2026-11-19")).not.toBe(overdueReminderKey("req_1", "2026-11-20"));
    expect(daysBetween("2026-11-17", "2026-11-19")).toBe(2);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("workflow failure reports", () => {
  it("stores one record per failed n8n execution, however often the report is retried", async () => {
    const { db, rows } = fakeDb();
    const report = { idempotencyKey: "n8n-error:7:231", workflowName: "LendLoop - Overdue reminders", message: "Request failed" };
    const first = await handlerOf(recordWorkflowFailure)({ db }, report);
    expect(await handlerOf(recordWorkflowFailure)({ db }, report)).toBe(first);
    expect(rows("automationFailures")).toHaveLength(1);
  });
});
