import { useEffect, useRef } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { useCreditSends } from "@/lib/creditSends";

/** Runs the configured monthly credit-statement queue from every staff page. */
export default function CreditMonthlyAutomation() {
  const me = useCurrentUser();
  const customers = useStore((s) => s.customers);
  const creditTx = useStore((s) => s.creditTx);
  const enabled = useSettings((s) => s.creditMonthlyEnabled);
  const runDay = useSettings((s) => s.creditMonthlyRunDay);
  const template = useSettings((s) => s.creditMessageTemplate);
  const enqueue = useCreditSends((s) => s.enqueue);
  const running = useRef(false);

  useEffect(() => {
    if (me?.role !== "admin" || !enabled || running.current) return;
    const today = new Date();
    if (today.getDate() < runDay || customers.length === 0) return;
    const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (localStorage.getItem("credit-monthly-last-run-v2") === yearMonth) return;

    running.current = true;
    void (async () => {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const endMs = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        23,
        59,
        59,
        999
      ).getTime();
      const periodStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
      const periodEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      const monthLabel = start.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      let attempted = 0;
      let queued = 0;

      await useCreditSends.getState().load();

      for (const customer of customers) {
        if (customer.approvalStatus !== "approved" || customer.balance <= 0) continue;
        const alreadyQueued = useCreditSends.getState().items.some(
          (item) =>
            item.kind === "statement" &&
            item.customerId === customer.id &&
            item.periodStart === periodStart &&
            item.periodEnd === periodEnd
        );
        if (alreadyQueued) continue;
        attempted += 1;
        let balance = 0;
        creditTx
          .filter((tx) => tx.customerId === customer.id)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .forEach((tx) => {
            const time = new Date(tx.date).getTime();
            if (time <= endMs) balance += tx.type === "sale" ? tx.amount : -tx.amount;
          });
        const amount = Math.max(0, balance || customer.balance);
        const message = (template ||
          "Hello {name},\nYour credit statement for {month} is ready.\nTotal balance: MVR {amount}\nThank you.")
          .replace(/\{name\}/g, customer.name)
          .replace(/\{month\}/g, monthLabel)
          .replace(/\{amount\}/g, amount.toFixed(2))
          .replace(/\{link\}/g, "");
        const result = await enqueue({
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone || null,
          amount,
          kind: "statement",
          message,
          link: null,
          periodStart,
          periodEnd,
        });
        if (result.ok) queued += 1;
      }

      if (attempted === 0 || queued === attempted) {
        localStorage.setItem("credit-monthly-last-run-v2", yearMonth);
      }
      running.current = false;
    })();
  }, [me?.role, enabled, runDay, template, customers, creditTx, enqueue]);

  return null;
}
