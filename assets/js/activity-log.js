/*************************************************
 * ACTIVITY-LOG.JS
 * Shared helper for writing to activity_log.
 * Include this script AFTER auth.js/user-context.js
 * (it needs AttendNGContext and supabaseClient) and
 * BEFORE the page's own script, on any page that
 * calls logActivity().
 *************************************************/

async function logActivity(action, targetName, detail) {

    try {

        const { error } =
            await supabaseClient
                .from("activity_log")
                .insert({
                    school_id: AttendNGContext.schoolId,
                    actor_id: AttendNGContext.memberId,
                    actor_name: AttendNGContext.fullName || "Unknown",
                    action,
                    target_name: targetName || null,
                    detail: detail || null
                });

        if (error) {

            // Never let a logging failure block the actual action —
            // just note it in the console for debugging.

            console.error("Unable to write activity log:", error);

        }

    }
    catch (error) {

        console.error("Unable to write activity log:", error);

    }

}