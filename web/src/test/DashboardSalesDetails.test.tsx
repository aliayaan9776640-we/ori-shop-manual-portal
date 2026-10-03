import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import DashboardSalesDetails from '@/components/DashboardSalesDetails';
import type {DamagedItem} from '@/lib/types';
afterEach(cleanup);
it('explains the total with sale records and subtracts damage from profit',()=>{
 const close=vi.fn();
 render(<DashboardSalesDetails title="This Month" from="01/10/2026" onClose={close} sales={[
 {id:'sale-1',date:'2026-10-01T10:00:00Z',total:100,profit:30,paymentMethod:'cash',cashierId:'staff',items:[]},
 {id:'sale-2',date:'2026-10-02T10:00:00Z',total:50,profit:20,paymentMethod:'bank',cashierId:'staff',items:[]}
 ]} damaged={[{id:'loss',name:'Damaged goods',date:'2026-10-02T12:00:00Z',reason:'Broken',valueLoss:7} as DamagedItem]}/>);
 expect(screen.getByRole('dialog')).toHaveTextContent('MVR 150.00');
 expect(screen.getByText(/Revenue =/)).toHaveTextContent('MVR 50.00 sales profit − MVR 7.00 damage losses = MVR 43.00');
 expect(screen.getByText('sale-1')).toBeInTheDocument();
 expect(screen.getByText('sale-2')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(close).toHaveBeenCalledOnce();
});
