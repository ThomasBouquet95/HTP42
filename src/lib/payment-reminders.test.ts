import { describe, expect, it } from "vitest";
import {
  buildPaymentReminders,
  classifyUrgency,
  daysOverdue,
  remindersHeadline,
  renderRemindersSections,
  type PaymentLike,
} from "./payment-reminders";

const TODAY = "2026-09-18";

const pay = (over: Partial<PaymentLike>): PaymentLike => ({
  id: Math.random().toString(36).slice(2),
  direction: "Inflow",
  paymentStatus: "To be paid",
  dueDate: null,
  amountEur: 1000,
  reference: "REF",
  clientLabel: "Acme",
  memberLabel: "Jane Doe",
  isMember: false,
  ...over,
});

describe("daysOverdue / classifyUrgency", () => {
  it("counts whole days past the due date", () => {
    expect(daysOverdue("2026-09-18", TODAY)).toBe(0);
    expect(daysOverdue("2026-09-11", TODAY)).toBe(7);
    expect(daysOverdue("2026-09-10", TODAY)).toBe(8);
    expect(daysOverdue("2026-09-25", TODAY)).toBe(-7); // future
    expect(daysOverdue(null, TODAY)).toBe(0);
  });

  it("red > 1 week overdue, orange within a week, green otherwise", () => {
    expect(classifyUrgency("2026-09-10", TODAY)).toBe("red"); // 8 days
    expect(classifyUrgency("2026-09-11", TODAY)).toBe("orange"); // exactly 7 days
    expect(classifyUrgency("2026-09-17", TODAY)).toBe("orange"); // 1 day
    expect(classifyUrgency("2026-09-18", TODAY)).toBe("green"); // due today
    expect(classifyUrgency("2026-10-01", TODAY)).toBe("green"); // future
    expect(classifyUrgency(null, TODAY)).toBe("green"); // undated
  });
});

describe("buildPaymentReminders", () => {
  it("splits incoming vs member-outgoing and drops settled/closed payments", () => {
    const m = buildPaymentReminders(
      [
        pay({ direction: "Inflow", amountEur: 5000 }),
        pay({ direction: "Inflow", amountEur: 9999, paymentStatus: "Paid" }), // closed
        pay({ direction: "Outflow", isMember: true, amountEur: 2000, memberLabel: "Bob" }),
        pay({ direction: "Outflow", isMember: false, amountEur: 3000 }), // vendor/expense, not a member
        pay({ direction: "Inflow", amountEur: 0 }), // no amount
      ],
      TODAY,
      "18 September 2026",
    );
    expect(m.client.items.length).toBe(1);
    expect(m.client.totalEur).toBe(5000);
    expect(m.member.items.length).toBe(1);
    expect(m.member.items[0].label).toBe("Bob");
  });

  it("sorts red (most overdue) first, then orange, then green (soonest due), undated last", () => {
    const m = buildPaymentReminders(
      [
        pay({ direction: "Inflow", dueDate: "2026-09-30", reference: "future" }), // green
        pay({ direction: "Inflow", dueDate: null, reference: "undated" }), // green undated
        pay({ direction: "Inflow", dueDate: "2026-09-01", reference: "veryLate" }), // red 17d
        pay({ direction: "Inflow", dueDate: "2026-09-15", reference: "recent" }), // orange 3d
        pay({ direction: "Inflow", dueDate: "2026-09-05", reference: "late" }), // red 13d
      ],
      TODAY,
      "d",
    );
    expect(m.client.items.map((i) => i.reference)).toEqual([
      "veryLate", // red, 17d
      "late", // red, 13d
      "recent", // orange, 3d
      "future", // green, soonest future
      "undated", // green, undated last
    ]);
    expect(m.client.counts).toEqual({ red: 2, orange: 1, green: 2 });
    // overdue total = the two reds + the orange
    expect(m.client.overdueEur).toBe(3000);
  });
});

describe("renderRemindersSections", () => {
  it("marks every item, shows overdue days, and notes empty groups", () => {
    const m = buildPaymentReminders(
      [
        pay({ direction: "Inflow", dueDate: "2026-09-01", amountEur: 1000, clientLabel: "Late Co" }),
        pay({ direction: "Inflow", dueDate: "2026-10-01", amountEur: 500, clientLabel: "Future Co" }),
      ],
      TODAY,
      "d",
    );
    const html = renderRemindersSections(m);
    expect(html).toContain("🔴");
    expect(html).toContain("🟢");
    expect(html).toContain("days overdue");
    expect(html).toContain("None outstanding."); // member group empty
  });

  it("headline calls out overdue counts", () => {
    const m = buildPaymentReminders(
      [pay({ direction: "Inflow", dueDate: "2026-09-01", amountEur: 1000 })],
      TODAY,
      "d",
    );
    expect(remindersHeadline(m)).toMatch(/Incoming: €1,000 across 1 \(1 overdue/);
  });
});
