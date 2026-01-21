import { fetchWithAuth } from "./client";

export const familyApi = {
    getMembers: async () => {
        return fetchWithAuth("/families/members");
    },
    getMyFamily: async () => {
        return fetchWithAuth("/families/");
    },
    createFamily: async (name: string) => {
        return fetchWithAuth("/families/", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
    },
    joinFamily: async (inviteCode: string) => {
        return fetchWithAuth("/families/join", {
            method: "POST",
            body: JSON.stringify({ invite_code: inviteCode }),
        });
    },
};
