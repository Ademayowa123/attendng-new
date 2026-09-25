// =========================================================
// Edge Function: delete-platform-admin
// =========================================================
// Called by a logged-in superadmin. Deletes another
// superadmin's auth user entirely — platform_admins has
// `on delete cascade` from auth.users, and the founder /
// last-superadmin guardrails are enforced by a database
// trigger regardless of what triggered the delete.
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return jsonResponse({ error: "Missing Authorization header." }, 401);
        }

        const callerClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const {
            data: { user },
            error: callerError,
        } = await callerClient.auth.getUser();

        if (callerError || !user) {
            return jsonResponse({ error: "Not authenticated." }, 401);
        }

        const adminClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: callerAdmin, error: callerAdminError } = await adminClient
            .from("platform_admins")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (callerAdminError) throw callerAdminError;

        if (!callerAdmin) {
            return jsonResponse(
                { error: "Only superadmins can do this." },
                403
            );
        }

        const { targetId } = await req.json();

        if (!targetId || typeof targetId !== "string") {
            return jsonResponse({ error: "A target ID is required." }, 400);
        }

        if (targetId === callerAdmin.id) {
            return jsonResponse(
                { error: "You can't remove your own account this way." },
                403
            );
        }

        const { data: targetAdmin, error: targetError } = await adminClient
            .from("platform_admins")
            .select("id, user_id, is_founder")
            .eq("id", targetId)
            .maybeSingle();

        if (targetError) throw targetError;

        if (!targetAdmin) {
            return jsonResponse({ error: "That superadmin couldn't be found." }, 404);
        }

        if (targetAdmin.is_founder) {
            return jsonResponse(
                { error: "The founding superadmin can't be removed." },
                403
            );
        }

        const { error: deleteError } = await adminClient.rpc(
            "delete_auth_user_as_admin",
            { target_user_id: targetAdmin.user_id }
        );

        if (deleteError) throw deleteError;

        return jsonResponse({ success: true });
    } catch (error) {
        console.error("delete-platform-admin error:", error);
        return jsonResponse({ error: error.message ?? "Unexpected error." }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}