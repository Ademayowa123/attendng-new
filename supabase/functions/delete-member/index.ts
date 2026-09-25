// =========================================================
// Edge Function: delete-member
// =========================================================
// Called by a school admin. Deletes the target's AUTH USER
// entirely — school_members has `on delete cascade` from
// auth.users, so the membership row (and, per migration 011,
// any class assignment) cleans up automatically.
//
// The genesis-account and last-admin guardrails still apply:
// they're enforced by a database trigger on school_members,
// which fires regardless of what triggered the delete.
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

        const { data: callerMember, error: callerMemberError } = await adminClient
            .from("school_members")
            .select("id, school_id, role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (callerMemberError) throw callerMemberError;

        if (!callerMember || callerMember.role !== "admin") {
            return jsonResponse(
                { error: "Only school admins can remove members." },
                403
            );
        }

        const { memberId } = await req.json();

        if (!memberId || typeof memberId !== "string") {
            return jsonResponse({ error: "A member ID is required." }, 400);
        }

        const { data: targetMember, error: targetError } = await adminClient
            .from("school_members")
            .select("id, user_id, school_id, is_genesis")
            .eq("id", memberId)
            .maybeSingle();

        if (targetError) throw targetError;

        if (!targetMember) {
            return jsonResponse({ error: "That member couldn't be found." }, 404);
        }

        if (targetMember.school_id !== callerMember.school_id) {
            return jsonResponse(
                { error: "You can only remove members within your own school." },
                403
            );
        }

        if (targetMember.is_genesis) {
            return jsonResponse(
                { error: "The genesis account can't be removed." },
                403
            );
        }

        if (memberId === callerMember.id) {
            return jsonResponse(
                { error: "You can't remove your own account this way." },
                403
            );
        }

        // Deleting the auth user cascades to school_members —
        // the last-admin guardrail trigger will reject this
        // with a clear error if it would leave the school with
        // zero admins. Uses the RPC wrapper rather than the
        // Admin API's deleteUser, since that method fails with
        // a generic error in this project even though the
        // underlying delete is confirmed to work.
        const { error: deleteError } = await adminClient.rpc(
            "delete_auth_user_as_admin",
            { target_user_id: targetMember.user_id }
        );

        if (deleteError) throw deleteError;

        return jsonResponse({ success: true });
    } catch (error) {
        console.error("delete-member error:", error);
        return jsonResponse({ error: error.message ?? "Unexpected error." }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}