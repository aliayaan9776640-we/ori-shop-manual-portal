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
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Deposit to Bank Account/ })); await screen.findByText("Record a money movement");
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
  it("records an other-source deposit without a cash transfer", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", {name:/Deposit to Bank Account/}));
    fireEvent.change(screen.getByLabelText("Deposit source"),{target:{value:"other"}});
    fireEvent.change(screen.getByLabelText("Bank account"),{target:{value:"bank"}});
    fireEvent.change(screen.getByLabelText("Amount (MVR)"),{target:{value:"125"}});
    fireEvent.change(screen.getByLabelText("Reason / purchase details / deposit reference"),{target:{value:"Owner contribution"}});
    fireEvent.click(screen.getByRole("button",{name:"Record transaction"}));
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("finance_post",expect.objectContaining({p_kind:"bank_receipt",p_amount:125,p_account:"bank"})));
  });
  it("hides money-entry controls when the database cannot be read", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "Offline" } });
    mount(); expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.queryByRole("button", { name: "Record transaction" })).not.toBeInTheDocument();
  });
  it("shows historical actual cash and recorded excess without posting money", async () => {
    mock.rpc.mockResolvedValue({data:{...data,accounts:[],closings:[{drawer_id:'old',closed_at:'2026-10-02T18:20:40Z',cashier_name:'Cashier',opening_cash:1300,cash_sales:1035.58,deductions:575,counted_cash:525,recorded_expected:184.57,difference:340.43,card_sales:0,transfer_sales:1629.78,tracked:false}]},error:null});
    mount(); await screen.findByText('Daily Cash Collections · All Recorded Closings');
    fireEvent.change(screen.getByLabelText('Dashboard date'),{target:{value:'2026-10-02'}});
    expect(await screen.findByText('Historical record · not posted to accounts')).toBeInTheDocument();
    expect(screen.getAllByText(/525.00/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button',{name:'Record receipt'})).not.toBeInTheDocument();
    expect(mock.rpc.mock.calls.every(([name])=>name!=='finance_post')).toBe(true);
  });
  it.each([["Use Cash","cash_expense"],["Use Bank Money","bank_expense"],["Deposit to Bank Account","deposit"],["Add Bank Account","bank_opening"]])("opens %s in a visible dialog", async (label,action) => {
    mount(); fireEvent.click(await screen.findByRole('button',{name:label,exact:true}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Action')).toHaveValue(action);
    fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it.each([/Today’s Total Sales/,/Today’s Card Payments/,/Today’s Bank Transfers/,/Today’s Cash Sales/,/Total Deposited/,/Money Used/,/Bank Account Balance/])('opens details for %s',async label=>{
    mount(); fireEvent.click(await screen.findByRole('button',{name:label}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    if (String(label).includes('Bank Account Balance')) await screen.findByText('No recorded bank transactions for this account.');
    expect(mock.rpc.mock.calls.every(([name])=>name!=='finance_post')).toBe(true);
  });
  it('provides bank setup from a deposit with no bank accounts',async()=>{
    mock.rpc.mockResolvedValue({data:{...data,accounts:[data.accounts[0]]},error:null});
    mount(); fireEvent.click(await screen.findByRole('button',{name:'Deposit to Bank Account'}));
    expect(screen.getByRole('button',{name:'Record transaction'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Set up bank account'}));
    expect(screen.getByLabelText('Account name')).toBeInTheDocument();
    expect(screen.getByLabelText('Action')).toHaveValue('bank_opening');
  });
  it("requires an explicit opening balance rather than inventing historic cash", async () => {
    mock.rpc.mockResolvedValue({ data: { ...data, accounts: [] }, error: null });
    mount(); await screen.findByText("Initialize cash tracking");
    expect(screen.getByLabelText("Opening balance (MVR)")).toHaveValue(null);
    expect(screen.getByText(/Daily counts are not summed/)).toBeInTheDocument();
  });
});
