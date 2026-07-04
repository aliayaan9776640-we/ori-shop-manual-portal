// @ts-nocheck

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bmlApiKey = Deno.env.get("BML_API_KEY") || "";
  const siteUrl = Deno.env.get("SITE_URL") || "https://www.oribarakah.com";

  const successPage = `${siteUrl}/payment-success`;
  const failedPage = `${siteUrl}/payment-failed`;

  try {
    const url = new URL(req.url);

    const orderId = url.searchParams.get("order_id");
    const requestedOrderType = url.searchParams.get("order_type") || "preorder";

    console.log("BML CALLBACK HIT:", {
      url: req.url,
      orderId,
      requestedOrderType,
    });

    if (!supabaseUrl || !serviceRoleKey || !bmlApiKey) {
      console.error("Missing callback environment variables");
      return Response.redirect(`${failedPage}?reason=config_error`, 302);
    }

    if (!orderId) {
      return Response.redirect(`${failedPage}?reason=missing_order_id`, 302);
    }

    if (!["online", "preorder"].includes(requestedOrderType)) {
      return Response.redirect(`${failedPage}?reason=invalid_order_type`, 302);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let tableName =
      requestedOrderType === "online" ? "online_orders" : "preorder_orders";

    let { data: order, error: orderError } = await supabase
      .from(tableName)
      .select("id, bml_transaction_id")
      .eq("id", orderId)
      .maybeSingle();

    /*
      Safety fallback:
      If BML returns with missing/wrong order_type,
      try the other order table before failing.
    */
    if (!order?.bml_transaction_id) {
      const fallbackTable =
        tableName === "online_orders" ? "preorder_orders" : "online_orders";

      const fallback = await supabase
        .from(fallbackTable)
        .select("id, bml_transaction_id")
        .eq("id", orderId)
        .maybeSingle();

      if (fallback.data?.bml_transaction_id) {
        tableName = fallbackTable;
        order = fallback.data;
        orderError = fallback.error;
      }
    }

    const finalOrderType = tableName === "online_orders" ? "online" : "preorder";

    if (orderError || !order?.bml_transaction_id) {
      console.error("Order not found or missing BML transaction id:", {
        orderId,
        requestedOrderType,
        tableName,
        orderError,
      });

      return Response.redirect(
        `${failedPage}?reason=order_not_found&order_id=${encodeURIComponent(
          orderId
        )}&order_type=${encodeURIComponent(requestedOrderType)}`,
        302
      );
    }

    const bmlTransactionId = order.bml_transaction_id;

    const bmlStatusUrl = `https://api.merchants.bankofmaldives.com.mv/public/transactions/${encodeURIComponent(
      bmlTransactionId
    )}`;

    let bmlRes = await fetch(bmlStatusUrl, {
      method: "GET",
      headers: {
        Authorization: bmlApiKey.trim(),
        "Content-Type": "application/json",
      },
    });

    let bmlData = await bmlRes.json().catch(() => ({}));

    /*
      Fallback:
      Some API setups expect Bearer format.
      Try it only if raw API key failed.
    */
    if (!bmlRes.ok && bmlRes.status === 401) {
      bmlRes = await fetch(bmlStatusUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bmlApiKey.trim()}`,
          "Content-Type": "application/json",
        },
      });

      bmlData = await bmlRes.json().catch(() => ({}));
    }

    console.log("BML STATUS RESPONSE:", {
      ok: bmlRes.ok,
      status: bmlRes.status,
      data: bmlData,
    });

    if (!bmlRes.ok) {
      console.error("BML status check failed:", bmlData);

      if (tableName === "online_orders") {
        await supabase
          .from("online_orders")
          .update({
            payment_status: "pending",
            status: "pending",
            bml_raw_response: bmlData,
          })
          .eq("id", orderId);
      } else {
        await supabase
          .from("preorder_orders")
          .update({
            payment_status: "pending",
            order_status: "payment_pending",
            bml_raw_response: bmlData,
          })
          .eq("id", orderId);
      }

      return Response.redirect(
        `${failedPage}?reason=bml_status_check_failed&order_id=${encodeURIComponent(
          orderId
        )}&order_type=${encodeURIComponent(finalOrderType)}`,
        302
      );
    }

    const bmlText = JSON.stringify(bmlData).toLowerCase();

    const isPaid =
      bmlText.includes("paid") ||
      bmlText.includes("confirmed") ||
      bmlText.includes("approved") ||
      bmlText.includes("completed") ||
      bmlText.includes("success");

    if (isPaid) {
      if (tableName === "online_orders") {
        const { error: updateError } = await supabase
          .from("online_orders")
          .update({
            payment_status: "paid",
            status: "pending",
            bml_paid_at: new Date().toISOString(),
            bml_raw_response: bmlData,
          })
          .eq("id", orderId);

        if (updateError) {
          console.error("Online order paid update failed:", updateError);
          return Response.redirect(
            `${failedPage}?reason=update_failed&order_id=${encodeURIComponent(
              orderId
            )}&order_type=online`,
            302
          );
        }
      } else {
        const { error: updateError } = await supabase
          .from("preorder_orders")
          .update({
            payment_status: "approved",
            order_status: "accepted",
            bml_paid_at: new Date().toISOString(),
            bml_raw_response: bmlData,
          })
          .eq("id", orderId);

        if (updateError) {
          console.error("Preorder paid update failed:", updateError);
          return Response.redirect(
            `${failedPage}?reason=update_failed&order_id=${encodeURIComponent(
              orderId
            )}&order_type=preorder`,
            302
          );
        }
      }

      return Response.redirect(
        `${successPage}?from=bml_callback_v2&order_id=${encodeURIComponent(
          orderId
        )}&order_type=${encodeURIComponent(finalOrderType)}`,
        302
      );
    }

    if (tableName === "online_orders") {
      await supabase
        .from("online_orders")
        .update({
          payment_status: "failed",
          status: "cancelled",
          bml_raw_response: bmlData,
        })
        .eq("id", orderId);
    } else {
      await supabase
        .from("preorder_orders")
        .update({
          payment_status: "failed",
          order_status: "cancelled",
          bml_raw_response: bmlData,
        })
        .eq("id", orderId);
    }

    return Response.redirect(
      `${failedPage}?from=bml_callback_v2&order_id=${encodeURIComponent(
        orderId
      )}&order_type=${encodeURIComponent(
        finalOrderType
      )}&reason=incomplete`,
      302
    );
  } catch (error) {
    console.error("BML callback error:", error);

    return Response.redirect(`${failedPage}?reason=error`, 302);
  }
});