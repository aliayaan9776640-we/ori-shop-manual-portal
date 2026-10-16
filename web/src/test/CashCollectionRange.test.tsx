import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,describe,it,expect } from "vitest";
import CashCollectionRange,{collectionRange} from "@/components/CashCollectionRange";
const rows=[
 {drawer_id:"one",closed_at:"2026-10-01T18:00:00Z",cashier_name:"First cashier",counted_cash:1630,opening_cash:1300,deductions:1083,difference:1053.90},
 {drawer_id:"two",closed_at:"2026-10-01T19:00:00Z",cashier_name:"Second cashier",counted_cash:525,opening_cash:1300,deductions:575,difference:340.43},
 {drawer_id:"three",closed_at:"2026-10-02T19:00:00Z",cashier_name:"Third cashier",counted_cash:1500,opening_cash:1300,deductions:0,difference:0}
];
afterEach(cleanup);
describe("cash collection range",()=>{
 it("includes both endpoints using Maldives closing dates",()=>{
  expect(collectionRange(rows,"2026-10-01","2026-10-02").map(c=>c.drawer_id)).toEqual(["one","two"]);
 });
 it("checks records and net collections, then resets to all dates",()=>{
  render(<CashCollectionRange closings={rows}/>);
  fireEvent.change(screen.getByLabelText("Collected from"),{target:{value:"2026-10-01"}});
  fireEvent.change(screen.getByLabelText("Collected to"),{target:{value:"2026-10-02"}});
  expect(screen.getByTestId("collection-net")).toHaveTextContent("-MVR 445.00");
  expect(screen.getByRole("status")).toHaveTextContent("2026-10-01 to 2026-10-02");
  fireEvent.click(screen.getByRole("button",{name:"Check range"}));
  expect(screen.getByText("First cashier")).toBeInTheDocument();
  expect(screen.queryByText("Third cashier")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"All dates"}));
  expect(screen.getByText("Third cashier")).toBeInTheDocument();
  expect(screen.getByTestId("collection-net")).toHaveTextContent("245.00");
 });
 it("rejects reversed dates and shows empty periods accurately",()=>{
  render(<CashCollectionRange closings={rows}/>);
  fireEvent.change(screen.getByLabelText("Collected from"),{target:{value:"2026-10-04"}});
  fireEvent.change(screen.getByLabelText("Collected to"),{target:{value:"2026-10-01"}});
  fireEvent.click(screen.getByRole("button",{name:"Check range"}));
  expect(screen.getByRole("alert")).toHaveTextContent("From date");
  expect(screen.queryByTestId("collection-net")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Collected to"),{target:{value:"2026-10-05"}});
  fireEvent.click(screen.getByRole("button",{name:"Check range"}));
  expect(screen.getByText("No cash drawer closings in this range.")).toBeInTheDocument();
  expect(screen.getByTestId("collection-net")).toHaveTextContent("0.00");
 });
});
