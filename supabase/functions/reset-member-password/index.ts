// =========================================================
// Edge Function: reset-member-password
// =========================================================
// Called by a logged-in school admin. Resets ANY member's
// password within the caller's own school — a teacher's, or
// another admin's — and returns a new one-time temporary
// password, same reveal pattern as create-teacher.
//
// Runs with the service-role key: resetting someone else's
// auth password can't be done from the browser.
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

        // Verify the CALLER is genuinely an admin, using their own JWT.
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

        const { data: callerMember, error: callerMemberError } = await adminClient
            .from("school_members")
            .select("id, school_id, role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (callerMemberError) throw callerMemberError;

        if (!callerMember || callerMember.role !== "admin") {
            return jsonResponse(
                { error: "Only school admins can reset passwords." },
                403
            );
        }

        // =====================================================
        // Parse input — which member's password to reset
        // =====================================================
        const { memberId } = await req.json();

        if (!memberId || typeof memberId !== "string") {
            return jsonResponse({ error: "A member ID is required." }, 400);
        }

        const { data: targetMember, error: targetError } = await adminClient
            .from("school_members")
            .select("id, user_id, username, school_id, full_name")
            .eq("id", memberId)
            .maybeSingle();

        if (targetError) throw targetError;

        if (!targetMember) {
            return jsonResponse({ error: "That member couldn't be found." }, 404);
        }

        // The target must belong to the SAME school as the caller —
        // an admin can only reset passwords within their own school.
        if (targetMember.school_id !== callerMember.school_id) {
            return jsonResponse(
                { error: "You can only reset passwords within your own school." },
                403
            );
        }

        // =====================================================
        // Generate and apply the new temporary password
        // =====================================================
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
        console.error("reset-member-password error:", error);
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