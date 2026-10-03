/** Cash sale totals already exclude change returned to the customer. */
export function expectedDrawerCash(opening: number, netCashSales: number, cashOut: number): number {
  return (Math.round(opening * 100) + Math.round(netCashSales * 100) - Math.round(cashOut * 100)) / 100;
}
