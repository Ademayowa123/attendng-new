// =========================================================
// Edge Function: create-platform-admin
// =========================================================
// Called by an existing platform admin. Creates a new
// platform_admins account — the only tier in the whole
// system that gets a REAL email, since it's the one account
// with no one above it to reset a forgotten password.
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
                { error: "Only existing superadmins can add another one." },
                403
            );
        }

        const { email, fullName } = await req.json();

        if (!email || typeof email !== "string" || !email.includes("@")) {
            return jsonResponse({ error: "A valid email is required." }, 400);
        }

        if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
            return jsonResponse({ error: "A full name is required." }, 400);
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const temporaryPassword =
            generateTemporaryPassword();

        const { data: createdUser, error: createUserError } =
            await adminClient.auth.admin.createUser({
                email: normalizedEmail,
                password: temporaryPassword,
                email_confirm: true,
            });

        if (createUserError) throw createUserError;

        const { error: insertError } = await adminClient
            .from("platform_admins")
            .insert({
                user_id: createdUser.user.id,
                email: normalizedEmail,
                full_name: fullName.trim().toUpperCase(),
            });

        if (insertError) {
            await adminClient.auth.admin.deleteUser(createdUser.user.id);
            throw insertError;
        }

        return jsonResponse({
            credentials: {
                email: normalizedEmail,
                password: temporaryPassword,
            },
        });
    } catch (error) {
        console.error("create-platform-admin error:", error);
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