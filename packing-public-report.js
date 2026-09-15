(function(){
  'use strict';
  var client = window.supabase.createClient(
    'https://fmjjzhrunvgghevvhfyb.supabase.co',
    'sb_publishable_yVPu0Ip5Mx82KUH0MhRUwA_Vybrl-Uc'
  );

  function toLocalSession(row){
    var items = (row.packing_items || []).sort(function(a,b){ return String(a.created_at).localeCompare(String(b.created_at)); });
    return {
      _cloudId: row.id,
      date: row.packing_date,
      packer: row.packer_name,
      products: items.map(function(item){
        return { _cloudId:item.id, product:item.product, qty:Number(item.qty), orderDateFrom:item.order_date_from || '', orderDateTo:item.order_date_to || '' };
      }),
      totalQty: items.reduce(function(sum,item){ return sum + Number(item.qty || 0); }, 0)
    };
  }

  async function loadPublicReport(){
    try {
      var result = await client.from('packing_sessions')
        .select('id,packing_date,packer_name,created_at,packing_items(id,product,qty,order_date_from,order_date_to,created_at)')
        .order('packing_date', {ascending:false});
      if(result.error) throw result.error;
      localStorage.setItem('pi_packing_manual', JSON.stringify((result.data || []).map(toLocalSession)));
      window.dispatchEvent(new CustomEvent('packingpublicready'));
    } catch(error) {
      console.error('Public report load error', error);
    }
  }

  loadPublicReport();
})();
