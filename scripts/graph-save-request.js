import { MODULE_ID, err, safeUUID, t } from "./constants.js";

const REQUEST_ID = "ownerSaveId";
const REQUEST = "ownerSaveRequest";
const RESULT = "ownerSaveResult";
const SAVE_TIMEOUT_MS = 30_000;

function activeGamemaster() {
    const role = foundry.CONST.USER_ROLES.GAMEMASTER;
    return game.users.contents.filter(user => user.active && user.role === role)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
}

async function removeRequest(message) {
    if (!game.messages.get(message.id)) return;
    try {
        await message.delete({ render: false });
    } catch (error) {
        err("Could not remove delegated graph save request", error);
    }
}

export function registerGraphSaveRequests(saveGraph) {
    Hooks.on("renderChatMessageHTML", (message, html) => {
        if (message.getFlag(MODULE_ID, REQUEST_ID)) html.style.display = "none";
    });

    Hooks.on("createChatMessage", async (message, _options, userId) => {
        const request = message.getFlag(MODULE_ID, REQUEST);
        if (typeof request !== "string" || !message.getFlag(MODULE_ID, REQUEST_ID) ||
            message.whisper.length !== 1 || message.whisper[0] !== game.user.id ||
            game.user.role !== foundry.CONST.USER_ROLES.GAMEMASTER) return;

        let result;
        try {
            // The creation hook supplies the requesting user independently of the payload.
            result = await saveGraph(JSON.parse(request), userId);
        } catch (error) {
            err("Delegated graph save failed", error);
            result = "failed";
        }

        try {
            await message.update({
                [`flags.${MODULE_ID}.-=${REQUEST}`]: null,
                [`flags.${MODULE_ID}.${RESULT}`]: result
            }, { render: false });
        } catch (error) {
            err("Could not acknowledge delegated graph save", error);
        } finally {
            await removeRequest(message);
        }
    });
}

export async function requestGraphSave(request) {
    const gm = activeGamemaster();
    if (!gm) throw new Error(t("Notifications.GraphSaveNoActiveGM"));

    const requestId = safeUUID();
    let hookId;
    let timeout;
    let message;
    let timedOut = false;
    try {
        const result = await new Promise((resolve, reject) => {
            hookId = Hooks.on("updateChatMessage", (updated, _changes, _options, userId) => {
                if (userId !== gm.id || updated.whisper[0] !== gm.id ||
                    updated.getFlag(MODULE_ID, REQUEST_ID) !== requestId) return;
                const status = updated.getFlag(MODULE_ID, RESULT);
                if (status) resolve(status);
            });
            timeout = setTimeout(() => {
                timedOut = true;
                if (message) void removeRequest(message);
                reject(new Error(t("Notifications.GraphSaveUnconfirmed")));
            }, SAVE_TIMEOUT_MS);

            const ChatMessage = CONFIG.ChatMessage.documentClass;
            ChatMessage.create({
                user: game.user.id,
                content: t("Notifications.GraphSaveRequest"),
                whisper: [gm.id],
                flags: { [MODULE_ID]: { [REQUEST_ID]: requestId, [REQUEST]: JSON.stringify(request) } }
            }, { render: false }).then(created => {
                if (!created) throw new Error(t("Notifications.GraphSaveRequestFailed"));
                message = created;
                if (timedOut) void removeRequest(message);
            }).catch(reject);
        });

        if (result === "saved") return true;
        if (result === "conflict") return false;
        if (result === "denied") throw new Error(t("Notifications.GraphAccessDenied"));
        throw new Error(t("Notifications.GraphSaveRequestFailed"));
    } finally {
        clearTimeout(timeout);
        Hooks.off("updateChatMessage", hookId);
    }
}
