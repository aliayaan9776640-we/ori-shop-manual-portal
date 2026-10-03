import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import BankAccountHistory from '@/components/BankAccountHistory';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const banks=[{id:'bank',name:'Business',balance:150}];
it('loads bank history and linked transfer reference, and filters by account',async()=>{
 rpc.mockResolvedValue({data:{count:1,entries:[{id:'entry',created_at:'2026-10-02T18:00:00Z',kind:'transfer_settlement',amount:50,fee:0,change:50,balance_after:150,reason:'Drawer transfers',source_name:'Sales',destination_name:'Business',drawer_id:'drawer',transfers:[{id:'sale',date:'2026-10-02T12:00:00Z',name:'Payer',reference:'REF-123',invoice:'INV-1',amount:50}]}]},error:null});
 render(<BankAccountHistory banks={banks} updated="first" onAdd={()=>{}}/>);
 expect(await screen.findByText('Customer bank transfers')).toBeInTheDocument();
 fireEvent.click(screen.getByText('View details'));
 expect(screen.getByText('Phone / reference: REF-123')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('History account'),{target:{value:'bank'}});
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('finance_bank_history',{p_account:'bank',p_offset:0}));
 await screen.findByText('Customer bank transfers');
});
it('reports read failure and retries without posting a transaction',async()=>{
 rpc.mockResolvedValueOnce({error:{message:'Connection lost'}}).mockResolvedValue({data:{entries:[],count:0},error:null});
 render(<BankAccountHistory banks={banks} updated="first" onAdd={()=>{}}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
 fireEvent.click(screen.getByRole('button',{name:'Retry history'}));
 expect(await screen.findByText('No recorded bank transactions for this account.')).toBeInTheDocument();
 expect(rpc.mock.calls.every(([name])=>name==='finance_bank_history')).toBe(true);
});
