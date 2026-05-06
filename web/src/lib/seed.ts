import type {
  User,
  Supplier,
  Product,
  Sale,
  DamagedItem,
  Order,
  CreditCustomer,
  CreditTransaction,
} from "./types";

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// Demo/local users have been removed. Authentication is now strictly
// Supabase-only. Admins must create real accounts via the Users page.
export const seedUsers: User[] = [];

export const seedSuppliers: Supplier[] = [
  {
    id: "s1",
    name: "Yangon Wholesale Co.",
    contactPerson: "U Tin Maung",
    phone: "+95 9 123 456 789",
    viber: "+95 9 123 456 789",
    email: "tin@yangonwholesale.com",
    address: "Pansodan St, Yangon",
    notes: "Best prices on dry goods. Loads on Tuesdays.",
  },
  {
    id: "s2",
    name: "Mandalay Trading Hub",
    contactPerson: "Daw Khin Aye",
    phone: "+95 9 222 333 444",
    viber: "+95 9 222 333 444",
    email: "khin@mandalaytrading.com",
    address: "78th St, Mandalay",
    notes: "Specializes in beverages and snacks.",
  },
  {
    id: "s3",
    name: "Coastal Fresh Supply",
    contactPerson: "Ko Zaw",
    phone: "+95 9 555 666 777",
    viber: "+95 9 555 666 777",
    email: "zaw@coastalfresh.com",
    address: "Strand Rd, Sittwe",
    notes: "Frozen and chilled goods, weekly boat.",
  },
];

export const seedProducts: Product[] = [
  {
    id: "p1",
    name: "Premium Jasmine Rice 25kg",
    barcode: "8801234500011",
    category: "Grains",
    supplierId: "s1",
    purchasePrice: 38000,
    sellingPrice: 46000,
    marginPct: 18,
    unit: "case",
    piecesPerCase: 1,
    stockPieces: 24,
    reorderLevel: 10,
    boatFee: 800,
    otherCost: 200,
  },
  {
    id: "p2",
    name: "Sunflower Cooking Oil 1L",
    barcode: "8801234500028",
    category: "Cooking",
    supplierId: "s1",
    purchasePrice: 4200,
    sellingPrice: 5300,
    marginPct: 22,
    unit: "case",
    piecesPerCase: 12,
    stockPieces: 96,
    reorderLevel: 48,
    boatFee: 100,
    otherCost: 50,
  },
  {
    id: "p3",
    name: "Instant Noodles Chicken",
    barcode: "8801234500035",
    category: "Snacks",
    supplierId: "s2",
    purchasePrice: 280,
    sellingPrice: 400,
    marginPct: 38,
    unit: "case",
    piecesPerCase: 30,
    stockPieces: 8,
    reorderLevel: 60,
    boatFee: 20,
    otherCost: 5,
  },
  {
    id: "p4",
    name: "Cola Soft Drink 330ml",
    barcode: "8801234500042",
    category: "Beverages",
    supplierId: "s2",
    purchasePrice: 600,
    sellingPrice: 850,
    marginPct: 35,
    unit: "case",
    piecesPerCase: 24,
    stockPieces: 144,
    reorderLevel: 72,
    boatFee: 40,
    otherCost: 10,
  },
  {
    id: "p5",
    name: "Sugar 1kg",
    barcode: "8801234500059",
    category: "Cooking",
    supplierId: "s1",
    purchasePrice: 1800,
    sellingPrice: 2300,
    marginPct: 22,
    unit: "kg",
    piecesPerCase: 25,
    stockPieces: 0,
    reorderLevel: 25,
    boatFee: 50,
    otherCost: 20,
  },
  {
    id: "p6",
    name: "Sardine Tin 425g",
    barcode: "8801234500066",
    category: "Canned",
    supplierId: "s3",
    purchasePrice: 1900,
    sellingPrice: 2600,
    marginPct: 30,
    unit: "tin",
    piecesPerCase: 24,
    stockPieces: 38,
    reorderLevel: 48,
    boatFee: 80,
    otherCost: 30,
  },
  {
    id: "p7",
    name: "Milk Powder 400g Box",
    barcode: "8801234500073",
    category: "Dairy",
    supplierId: "s2",
    purchasePrice: 5200,
    sellingPrice: 6800,
    marginPct: 25,
    unit: "box",
    piecesPerCase: 12,
    stockPieces: 18,
    reorderLevel: 24,
    boatFee: 150,
    otherCost: 50,
  },
  {
    id: "p8",
    name: "Laundry Detergent 1kg",
    barcode: "8801234500080",
    category: "Household",
    supplierId: "s1",
    purchasePrice: 3200,
    sellingPrice: 4200,
    marginPct: 25,
    unit: "piece",
    piecesPerCase: 12,
    stockPieces: 60,
    reorderLevel: 24,
    boatFee: 80,
    otherCost: 20,
    expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
  },
  {
    id: "p9",
    name: "Toothpaste 100g",
    barcode: "8801234500097",
    category: "Personal Care",
    supplierId: "s2",
    purchasePrice: 850,
    sellingPrice: 1200,
    marginPct: 35,
    unit: "piece",
    piecesPerCase: 36,
    stockPieces: 5,
    reorderLevel: 36,
    boatFee: 15,
    otherCost: 5,
  },
  {
    id: "p10",
    name: "Frozen Chicken 1kg",
    barcode: "8801234500103",
    category: "Frozen",
    supplierId: "s3",
    purchasePrice: 6500,
    sellingPrice: 8200,
    marginPct: 22,
    unit: "kg",
    piecesPerCase: 10,
    stockPieces: 12,
    reorderLevel: 20,
    boatFee: 300,
    otherCost: 100,
  },
];

const seedSale = (
  id: string,
  daysBack: number,
  items: { p: Product; q: number }[],
  payment: "cash" | "card" | "bank" | "credit" = "cash",
  customerId?: string
): Sale => {
  const date = daysAgo(daysBack);
  const lineItems = items.map((it) => {
    const landed = it.p.purchasePrice + it.p.boatFee + it.p.otherCost;
    const perPiece = landed / Math.max(1, it.p.piecesPerCase);
    const price = it.p.sellingPrice / Math.max(1, it.p.piecesPerCase);
    const total = price * it.q;
    return {
      productId: it.p.id,
      name: it.p.name,
      qty: it.q,
      unit: it.p.unit,
      unitQty: it.q / Math.max(1, it.p.piecesPerCase),
      price,
      landedCost: perPiece,
      total,
      profit: (price - perPiece) * it.q,
    };
  });
  const total = lineItems.reduce((s, x) => s + x.total, 0);
  const profit = lineItems.reduce((s, x) => s + x.profit, 0);
  return {
    id,
    date,
    items: lineItems,
    total,
    profit,
    paymentMethod: payment,
    customerId,
    cashierId: "u3",
  };
};

export const buildSeedSales = (products: Product[]): Sale[] => {
  const get = (id: string): Product => products.find((p) => p.id === id)!;
  return [
    seedSale("sl1", 0, [
      { p: get("p3"), q: 12 },
      { p: get("p4"), q: 24 },
      { p: get("p9"), q: 4 },
    ]),
    seedSale("sl2", 0, [
      { p: get("p2"), q: 6 },
      { p: get("p7"), q: 2 },
    ], "card"),
    seedSale("sl3", 0, [
      { p: get("p3"), q: 18 },
      { p: get("p10"), q: 3 },
    ], "credit", "c1"),
    seedSale("sl4", 1, [
      { p: get("p4"), q: 48 },
      { p: get("p3"), q: 30 },
    ]),
    seedSale("sl5", 2, [
      { p: get("p1"), q: 1 },
      { p: get("p2"), q: 12 },
    ]),
    seedSale("sl6", 3, [
      { p: get("p3"), q: 24 },
      { p: get("p6"), q: 6 },
    ]),
    seedSale("sl7", 4, [{ p: get("p4"), q: 24 }]),
    seedSale("sl8", 5, [
      { p: get("p3"), q: 30 },
      { p: get("p9"), q: 6 },
    ]),
    seedSale("sl9", 7, [{ p: get("p2"), q: 12 }]),
    seedSale("sl10", 10, [{ p: get("p3"), q: 60 }], "credit", "c2"),
    seedSale("sl11", 14, [{ p: get("p4"), q: 48 }]),
  ];
};

export const seedDamaged: DamagedItem[] = [
  {
    id: "d1",
    productId: "p4",
    name: "Cola Soft Drink 330ml",
    qty: 4,
    unit: "piece",
    unitQty: 4,
    reason: "Bottles cracked during loading",
    date: daysAgo(2),
    valueLoss: 4 * (650 / 24),
    reportedBy: "u2",
  },
  {
    id: "d2",
    productId: "p6",
    name: "Sardine Tin 425g",
    qty: 2,
    unit: "tin",
    unitQty: 2,
    reason: "Dented tins, expired warranty",
    date: daysAgo(5),
    valueLoss: 2 * 2010,
    reportedBy: "u2",
  },
];

export const seedCustomers: CreditCustomer[] = [
  {
    id: "c1",
    name: "Daw Hla Hla Shop",
    phone: "+95 9 700 100 200",
    address: "Village A, Coastal Rd",
    openingBalance: 0,
    creditLimit: 500000,
    notes: "Pays weekly on Friday",
    balance: 0,
    approvalStatus: "approved",
  },
  {
    id: "c2",
    name: "U Maung Maung",
    phone: "+95 9 700 300 400",
    address: "Village B, Hill Side",
    openingBalance: 50000,
    creditLimit: 300000,
    notes: "Long-term customer, reliable",
    balance: 50000,
    approvalStatus: "approved",
  },
  {
    id: "c3",
    name: "Sunshine Cafe",
    phone: "+95 9 700 500 600",
    address: "Main St, Town Center",
    openingBalance: 0,
    creditLimit: 800000,
    notes: "Buys beverages weekly",
    balance: 0,
    approvalStatus: "approved",
  },
];

export const seedCreditTx: CreditTransaction[] = [
  {
    id: "ct1",
    customerId: "c2",
    date: daysAgo(30),
    type: "sale",
    amount: 50000,
    note: "Opening balance",
  },
];

export const seedOrders: Order[] = [
  {
    id: "o1",
    supplierId: "s1",
    date: daysAgo(3),
    status: "loaded",
    boatName: "MV Andaman Star",
    boatContact: "+95 9 800 900 100",
    loadingDate: daysAgo(2),
    sentDate: daysAgo(3),
    expectedDate: daysAgo(-2),
    notes: "Standard weekly order",
    items: [
      {
        productId: "p1",
        name: "Premium Jasmine Rice 25kg",
        currentStock: 24,
        qty: 20,
        unit: "case",
        unitQty: 20,
        receivedQty: 0,
      },
      {
        productId: "p2",
        name: "Sunflower Cooking Oil 1L",
        currentStock: 96,
        qty: 60,
        unit: "case",
        unitQty: 5,
        receivedQty: 0,
      },
    ],
  },
];
