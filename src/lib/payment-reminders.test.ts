import { describe, expect, it } from "vitest";
import {
  buildPaymentReminders,
  classifyUrgency,
  daysOverdue,
  execHtmlToSlack,
  remindersHeadline,
  renderRemindersSections,
  renderRemindersSlack,
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

  it("never duplicates the reference when it stands in for a missing name", () => {
    // No resolved client/member name: the reference becomes the label and must
    // appear exactly once (and never a record id, which the route resolves away).
    const m = buildPaymentReminders(
      [pay({ direction: "Inflow", clientLabel: "", reference: "F-260720USD", amountEur: 1000 })],
      TODAY,
      "d",
    );
    expect(m.client.items[0].label).toBe("F-260720USD");
    const html = renderRemindersSections(m);
    expect((html.match(/F-260720USD/g) || []).length).toBe(1);
  });
});

describe("execHtmlToSlack", () => {
  it("converts bold/paragraph HTML to Slack mrkdwn", () => {
    const out = execHtmlToSlack("<p>Cash is <strong>tight</strong>.</p><p>Chase <b>Pierre Fabre</b>.</p>");
    expect(out).toContain("*tight*");
    expect(out).toContain("*Pierre Fabre*");
    expect(out).not.toContain("<");
  });
});

describe("renderRemindersSlack", () => {
  const m = buildPaymentReminders(
    [
      pay({ direction: "Inflow", dueDate: "2026-09-01", amountEur: 58500, clientLabel: "Pierre Fabre", reference: "F-1" }),
      pay({ direction: "Inflow", dueDate: "2026-10-01", amountEur: 500, clientLabel: "Future Co", reference: "F-2" }),
      pay({ direction: "Outflow", isMember: true, dueDate: "2026-09-02", amountEur: 11250, memberLabel: "Dr. Linda Dib", reference: "RE-15" }),
    ],
    TODAY,
    "18 September 2026",
  );
  const out = renderRemindersSlack(m, "Summary line.", "https://x/admin/payments");

  it("includes the title, summary, both sections and the portal link", () => {
    expect(out).toContain("💶 Payments due — 18 September 2026");
    expect(out).toContain("Summary line.");
    expect(out).toContain("Client payments — incoming");
    expect(out).toContain("Payments to network members — outgoing");
    expect(out).toContain("→ https://x/admin/payments");
  });

  it("lists overdue items by name and rolls up the upcoming ones", () => {
    expect(out).toContain("*Pierre Fabre*"); // overdue, listed
    expect(out).toContain("*Dr. Linda Dib*"); // overdue, listed
    expect(out).toContain("1 upcoming / undated"); // Future Co not listed, counted
    expect(out).not.toContain("Future Co");
  });

  it("caps long overdue lists with a +N more", () => {
    const many = buildPaymentReminders(
      Array.from({ length: 20 }, (_, i) =>
        pay({ direction: "Inflow", dueDate: "2026-09-01", amountEur: 1000 + i, clientLabel: `Late ${i}`, reference: `F-${i}` }),
      ),
      TODAY,
      "18 September 2026",
    );
    const text = renderRemindersSlack(many, "", "https://x", 12);
    expect(text).toContain("+8 more overdue");
  });
});
