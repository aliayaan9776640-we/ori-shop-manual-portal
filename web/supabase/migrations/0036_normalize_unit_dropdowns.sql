-- Correct legacy unit dropdown rows whose stored values did not match their
-- visible labels. This preserves product prices and stock quantities.

begin;

update public.dropdown_options
set value = case lower(trim(label))
  when 'kg' then 'kg'
  when 'kilogram' then 'kg'
  when 'gram' then 'g'
  when 'piece' then 'piece'
  when 'bottle' then 'bottle'
  when 'packet' then 'packet'
  when 'tin' then 'tin'
  when 'can' then 'can'
  when 'box' then 'box'
  when 'case' then 'case'
  when 'bag' then 'bag'
  else value
end
where group_key = 'unit_type';

-- All current Gm records were reviewed and are KG produce. The old dropdown
-- displayed "Kg" while saving "Gm".
update public.products
set unit_type = 'kg',
    pieces_per_case = 1
where lower(trim(unit_type)) = 'gm';

commit;

