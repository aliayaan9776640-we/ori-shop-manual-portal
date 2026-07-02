// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha1Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  console.log("ORI BML CREATE PAYMENT FUNCTION RUNNING");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      throw new Error("Missing JSON body. order_id is required.");
    }

    const { order_id, order_type = "preorder" } = body;

    if (!order_id) {
      throw new Error("order_id is required");
    }

    if (order_type !== "preorder" && order_type !== "online") {
      throw new Error("Invalid order_type. Use preorder or online.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const bmlApiKey = (Deno.env.get("BML_API_KEY") || "")
      .trim()
      .replace(/[\r\n\s]/g, "")
      .replace(/[^A-Za-z0-9._-]/g, "");

    const currency = Deno.env.get("BML_CURRENCY") || "MVR";

    if (!serviceRoleKey) throw new Error("Missing service role key");
    if (!bmlApiKey) throw new Error("Missing BML_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let amount = 0;
    let tableName = "";
    let localId = String(order_id);

    if (order_type === "preorder") {
      tableName = "preorder_orders";

      const { data: order, error: orderError } = await supabase
        .from("preorder_orders")
        .select("id, agreed_price, payment_method, payment_status")
        .eq("id", order_id)
        .single();

      if (orderError || !order) {
        throw new Error(orderError?.message || "Order not found");
      }

      if (order.payment_method !== "bml_gateway") {
        throw new Error("This order is not a BML gateway order");
      }

      if (order.payment_status === "approved" || order.payment_status === "paid") {
        throw new Error("This order is already paid");
      }

      amount = Math.round(Number(order.agreed_price || 0) * 100);
      localId = order.id;

      // Mark as pending before opening BML.
      // Do not mark as accepted/paid here. Callback will decide success/fail.
      await supabase
        .from("preorder_orders")
        .update({
          payment_status: "pending",
        })
        .eq("id", order_id);
    }

    if (order_type === "online") {
      tableName = "online_orders";

      const { data: order, error: orderError } = await supabase
        .from("online_orders")
        .select("id, total, subtotal, payment_method, payment_status")
        .eq("id", order_id)
        .single();

      if (orderError || !order) {
        throw new Error(orderError?.message || "Online order not found");
      }

      if (order.payment_method !== "bml_gateway") {
        throw new Error("This online order is not a BML gateway order");
      }

      if (order.payment_status === "approved" || order.payment_status === "paid") {
        throw new Error("This online order is already paid");
      }

      amount = Math.round(Number(order.total ?? order.subtotal ?? 0) * 100);
      localId = order.id;

      // Mark as pending before opening BML.
      // Do not mark as paid here. Callback will decide success/fail.
      await supabase
        .from("online_orders")
        .update({
          payment_status: "pending",
        })
        .eq("id", order_id);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid order amount");
    }

    const redirectUrl = `${supabaseUrl}/functions/v1/bml-callback?order_id=${encodeURIComponent(
      order_id
    )}&order_type=${encodeURIComponent(order_type)}`;

    const signature = await sha1Hex(
      `amount=${amount}&currency=${currency}&apiKey=${bmlApiKey}`
    );

    const bmlBody = {
      currency,
      amount,
      redirectUrl,
      localId,
      apiVersion: "2.0",
      appVersion: "ori-barakah-store",
      signMethod: "sha1",
      signature,
    };

    const bmlRes = await fetch(
      "https://api.merchants.bankofmaldives.com.mv/public/transactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bmlApiKey,
        },
        body: JSON.stringify(bmlBody),
      }
    );

    const bmlData = await bmlRes.json().catch(() => ({}));

    console.log("BML response:", JSON.stringify(bmlData));

    if (!bmlRes.ok) {
      await supabase
        .from(tableName)
        .update({
          payment_status: "failed",
          bml_raw_response: bmlData,
        })
        .eq("id", order_id);

      throw new Error(bmlData?.message || "BML transaction create failed");
    }

    const transactionId =
      bmlData.id ||
      bmlData.transactionId ||
      bmlData.transaction_id ||
      bmlData.uuid ||
      null;

    const paymentUrl =
      bmlData.url ||
      bmlData.paymentUrl ||
      bmlData.payment_url ||
      bmlData.redirectUrl ||
      null;

    if (!paymentUrl) {
      await supabase
        .from(tableName)
        .update({
          payment_status: "failed",
          bml_raw_response: bmlData,
        })
        .eq("id", order_id);

      throw new Error("BML did not return payment URL");
    }

    await supabase
      .from(tableName)
      .update({
        bml_transaction_id: transactionId,
        bml_payment_url: paymentUrl,
        bml_raw_response: bmlData,
      })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        payment_url: paymentUrl,
        transaction_id: transactionId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("create-bml-payment error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});