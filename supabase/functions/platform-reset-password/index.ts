// =========================================================
// Edge Function: platform-reset-password
// =========================================================
// Called by a logged-in SUPERADMIN (platform_admins), not a
// school admin — this is the top of the recovery chain: a
// school's last remaining admin, forgotten, has nowhere left
// to go but here.
//
// Unlike reset-member-password (school-to-school, same
// school only), this one has no school restriction — a
// platform admin can reset anyone, anywhere.
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

        const { data: platformAdmin, error: platformAdminError } = await adminClient
            .from("platform_admins")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (platformAdminError) throw platformAdminError;

        if (!platformAdmin) {
            return jsonResponse(
                { error: "Only platform admins can do this." },
                403
            );
        }

        const { memberId } = await req.json();

        if (!memberId || typeof memberId !== "string") {
            return jsonResponse({ error: "A member ID is required." }, 400);
        }

        const { data: targetMember, error: targetError } = await adminClient
            .from("school_members")
            .select("id, user_id, username, full_name")
            .eq("id", memberId)
            .maybeSingle();

        if (targetError) throw targetError;

        if (!targetMember) {
            return jsonResponse({ error: "That member couldn't be found." }, 404);
        }

        const temporaryPassword = generateTemporaryPassword();

        const { error: updateError } = await adminClient.auth.admin.updateUserById(
            targetMember.user_id,
            { password: temporaryPassword }
        );

        if (updateError) throw updateError;

        return jsonResponse({
            credentials: {
                username: targetMember.username,
                password: temporaryPassword,
            },
        });
    } catch (error) {
        console.error("platform-reset-password error:", error);
        return jsonResponse({ error: error.message ?? "Unexpected error." }, 500);
    }
});

function generateTemporaryPassword(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let result = "";
    const randomValues = new Uint32Array(10);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < 10; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    return result;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}