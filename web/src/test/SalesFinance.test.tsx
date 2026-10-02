import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SalesFinance from "@/pages/SalesFinance";

const mock = vi.hoisted(() => ({ role: "admin", rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/store", () => ({ useCurrentUser: () => ({ id: "admin-1", role: mock.role }) }));
vi.mock("sonner", () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, supabase: {
  rpc: mock.rpc,
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
} }));
const data = { accounts: [{ id: "cash", kind: "cash", name: "Cash", balance: 500 }, { id: "bank", kind: "bank", name: "Business", balance: 200 }], closings: [], entries: [], entry_count: 0, open_float: 0 };
beforeEach(() => {
  vi.clearAllMocks(); mock.role = "admin";
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: vi.fn(() => "00000000-0000-0000-0000-000000000010") });
  mock.rpc.mockResolvedValue({ data, error: null });
});
afterEach(cleanup);
const mount = () => render(<MemoryRouter><SalesFinance /></MemoryRouter>);
describe("Sales Finance", () => {
  it("does not load or show balances to cashiers", () => {
    mock.role = "cashier"; mount();
    expect(screen.getByText("Administrator access required.")).toBeInTheDocument();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("posts a deposit using one atomic request and keeps its ID on retry", async () => {
    mock.rpc.mockImplementation(async name => ["finance_snapshot", "finance_dashboard"].includes(name) ? { data, error: null } : { error: { message: "Connection interrupted" } });
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Deposit On Hand Cash to Account/ })); await screen.findByText("Record a money movement");
    fireEvent.change(screen.getByLabelText("Bank account"), { target: { value: "bank" } });
    fireEvent.change(screen.getByLabelText("Amount (MVR)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Reason / purchase details / deposit reference"), { target: { value: "Deposit slip 123" } });
    fireEvent.click(screen.getByRole("button", { name: "Record transaction" }));
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith("Connection interrupted"));
    fireEvent.click(screen.getByRole("button", { name: "Record transaction" }));
    await waitFor(() => expect(mock.rpc.mock.calls.filter(([name]) => name === "finance_post")).toHaveLength(2));
    const calls = mock.rpc.mock.calls.filter(([name]) => name === "finance_post");
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(calls[0][1]).toMatchObject({ p_kind: "deposit", p_amount: 500, p_account: "bank", p_reason: "Deposit slip 123" });
  });
  it("hides money-entry controls when the database cannot be read", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "Offline" } });
    mount(); expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.queryByRole("button", { name: "Record transaction" })).not.toBeInTheDocument();
  });
  it("requires an explicit opening balance rather than inventing historic cash", async () => {
    mock.rpc.mockResolvedValue({ data: { ...data, accounts: [] }, error: null });
    mount(); await screen.findByText("Initialize cash tracking");
    expect(screen.getByLabelText("Opening balance (MVR)")).toHaveValue(null);
    expect(screen.getByText(/Historical drawer totals are not added again/)).toBeInTheDocument();
  });
});
