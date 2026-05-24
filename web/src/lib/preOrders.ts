import { customerSupabase, supabase } from "./supabase";

export type PreOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "completed"
  | "cancelled";

export interface PreOrder {
  id: string;
  customerName: string;
  phone: string;
  island: string;
  address: string;
  itemName: string;
  quantity: number;
  note: string;
  status: PreOrderStatus;
  createdAt: string;
  updatedAt: string;
}

interface PreOrderRow {
  id: string;
  customer_name: string;
  phone: string;
  island: string | null;
  address: string | null;
  item_name: string;
  quantity: number;
  note: string | null;
  status: PreOrderStatus;
  created_at: string;
  updated_at: string;
}

export interface CreatePreOrderInput {
  customerName: string;
  phone: string;
  island?: string;
  address?: string;
  itemName: string;
  quantity: number;
  note?: string;
}

const rowToPreOrder = (r: PreOrderRow): PreOrder => ({
  id: r.id,
  customerName: r.customer_name,
  phone: r.phone,
  island: r.island ?? "",
  address: r.address ?? "",
  itemName: r.item_name,
  quantity: Number(r.quantity) || 0,
  note: r.note ?? "",
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function createPreOrder(input: CreatePreOrderInput): Promise<PreOrder> {
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const { data, error } = await customerSupabase
    .from("pre_orders")
    .insert({
      customer_name: input.customerName.trim(),
      phone: input.phone.trim(),
      island: (input.island ?? "").trim(),
      address: (input.address ?? "").trim(),
      item_name: input.itemName.trim(),
      quantity: qty,
      note: (input.note ?? "").trim(),
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToPreOrder(data as PreOrderRow);
}

export async function getPreOrders(): Promise<PreOrder[]> {
  const { data, error } = await supabase
    .from("pre_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as PreOrderRow[]).map(rowToPreOrder);
}

export async function updatePreOrderStatus(
  id: string,
  status: PreOrderStatus
): Promise<void> {
  const { error } = await supabase
    .from("pre_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export function exportPreOrdersCsv(rows: PreOrder[], filename = "pre-orders.csv"): void {
  const headers = [
    "Date",
    "Customer Name",
    "Phone",
    "Island",
    "Address",
    "Item Name",
    "Quantity",
    "Status",
    "Note",
  ];

  const escape = (v: unknown): string => {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        new Date(r.createdAt).toLocaleString(),
        r.customerName,
        r.phone,
        r.island,
        r.address,
        r.itemName,
        r.quantity,
        r.status,
        r.note,
      ]
        .map(escape)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
