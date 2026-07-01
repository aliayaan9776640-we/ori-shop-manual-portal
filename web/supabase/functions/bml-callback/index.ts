// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id");

  const siteUrl = Deno.env.get("SITE_URL") || "https://www.oribarakah.com";

  try {
    if (!orderId) {
      return Response.redirect(`${siteUrl}/store?bml_payment=missing_order`, 302);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bmlApiKey = (Deno.env.get("BML_API_KEY") || "")
  .trim()
  .replace(/[\r\n\s]/g, "")
  .replace(/[^A-Za-z0-9._-]/g, "");

    if (!serviceRoleKey) {
      return Response.redirect(`${siteUrl}/store?bml_payment=server_error`, 302);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: order, error: orderError } = await supabase
      .from("preorder_orders")
      .select("id, bml_transaction_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order?.bml_transaction_id) {
      return Response.redirect(`${siteUrl}/store?bml_payment=order_not_found`, 302);
    }

    const bmlRes = await fetch(
      `https://api.merchants.bankofmaldives.com.mv/public/transactions/${encodeURIComponent(
        order.bml_transaction_id
      )}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: bmlApiKey,
        },
      }
    );

    const bmlData = await bmlRes.json().catch(() => ({}));
    const statusText = JSON.stringify(bmlData).toLowerCase();

    const paid =
      statusText.includes("paid") ||
      statusText.includes("confirmed") ||
      statusText.includes("approved") ||
      statusText.includes("completed") ||
      statusText.includes("success");

    if (paid) {
      await supabase
        .from("preorder_orders")
        .update({
          payment_status: "approved",
          order_status: "accepted",
          bml_paid_at: new Date().toISOString(),
          bml_raw_response: bmlData,
        })
        .eq("id", orderId);

      return Response.redirect(
        `${siteUrl}/store?bml_payment=success&order_id=${encodeURIComponent(orderId)}`,
        302
      );
    }

    await supabase
      .from("preorder_orders")
      .update({
        bml_raw_response: bmlData,
      })
      .eq("id", orderId);

    return Response.redirect(
      `${siteUrl}/store?bml_payment=pending&order_id=${encodeURIComponent(orderId)}`,
      302
    );
  } catch {
    return Response.redirect(`${siteUrl}/store?bml_payment=error`, 302);
  }
});