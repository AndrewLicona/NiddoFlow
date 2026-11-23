"use client";

import { useSyncExternalStore } from "react";

export const optionalModules = [
    { href: "/resources", label: "Recursos" },
    { href: "/goals", label: "Metas" },
] as const;

const key = "niddoflow-hidden-modules";

function subscribe(callback: () => void) {
    window.addEventListener(key, callback);
    window.addEventListener("storage", callback);
    return () => {
        window.removeEventListener(key, callback);
        window.removeEventListener("storage", callback);
    };
}

function snapshot() {
    return localStorage.getItem(key) ?? "";
}

export function useVisibleModules() {
    const hidden = useSyncExternalStore(subscribe, snapshot, () => "").split(",");
    return {
        isVisible: (href: string) => !hidden.includes(href),
        setVisible(href: string, visible: boolean) {
            const next = new Set(snapshot().split(",").filter(Boolean));
            if (visible) next.delete(href);
            else next.add(href);
            localStorage.setItem(key, [...next].join(","));
            window.dispatchEvent(new Event(key));
        },
    };
}
