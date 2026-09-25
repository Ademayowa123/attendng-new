// =========================================================
// Edge Function: delete-school
// =========================================================
// Called by a logged-in superadmin. Permanently deletes a
// school and everything under it: every member's account,
// every session, class, student, attendance record, and the
// school's logo file. Irreversible.
//
// Order matters:
//   1. Delete every member's AUTH USER first (via the same
//      RPC used elsewhere, since the Admin API method fails
//      in this project) — this cascades to school_members.
//      Doing it this way, rather than just deleting the
//      school row, avoids leaving orphaned auth accounts
//      behind with no membership and an unusable username.
//   2. Remove the logo file from storage (not part of the
//      database, so it doesn't cascade automatically).
//   3. Delete the school row itself — sessions, classes,
//      students, attendance, and weekly_settings all cascade
//      from there via existing foreign keys.
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
            return jsonResponse({ error: "Only superadmins can do this." }, 403);
        }

        const { schoolId, confirmName } = await req.json();

        if (!schoolId || typeof schoolId !== "string") {
            return jsonResponse({ error: "A school ID is required." }, 400);
        }

        const { data: school, error: schoolError } = await adminClient
            .from("schools")
            .select("id, name")
            .eq("id", schoolId)
            .maybeSingle();

        if (schoolError) throw schoolError;

        if (!school) {
            return jsonResponse({ error: "That school couldn't be found." }, 404);
        }

        // Require the caller to have typed the school's exact
        // name — the last line of defense against an
        // irreversible action triggered by a stray click.
        if (confirmName !== school.name) {
            return jsonResponse(
                { error: "The typed name didn't match. Nothing was deleted." },
                400
            );
        }

        // =====================================================
        // Delete everything in one atomic transaction — the RPC
        // handles disabling the genesis/last-admin guardrail
        // just for this legitimate cascading case, deleting
        // every member's auth account, and deleting the school
        // itself, all as one unit. If anything fails partway,
        // it all rolls back together.
        // =====================================================
        const { error: cascadeError } = await adminClient.rpc(
            "delete_school_cascade",
            { target_school_id: schoolId }
        );

        if (cascadeError) throw cascadeError;

        // =====================================================
        // Remove the logo file(s), if any — storage isn't part
        // of the database transaction above, so it's cleaned up
        // separately, after the school itself is confirmed gone.
        // =====================================================
        const { data: files } = await adminClient.storage
            .from("school-logos")
            .list(schoolId);

        if (files && files.length > 0) {
            await adminClient.storage
                .from("school-logos")
                .remove(files.map((f) => `${schoolId}/${f.name}`));
        }

        return jsonResponse({ success: true });
    } catch (error) {
        console.error("delete-school error:", error);
        return jsonResponse({ error: error.message ?? "Unexpected error." }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}