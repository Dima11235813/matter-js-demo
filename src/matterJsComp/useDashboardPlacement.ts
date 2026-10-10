import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import deps from "./Deps";

interface Placement {
    x: number;
    y: number;
    collapsed: boolean;
}

const STORAGE_KEY = "lexical-fountain.dashboard";
/** Pointer travel (px) under which a press on the header is a tap, not a drag. */
const TAP_SLOP = 6;
const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, collapsed: false };

function loadPlacement(): Placement {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
        if (parsed && typeof parsed.x === "number" && typeof parsed.y === "number") return { ...DEFAULT_PLACEMENT, ...parsed };
    } catch {
        /* storage blocked or corrupt: use the default */
    }
    return DEFAULT_PLACEMENT;
}

function savePlacement(placement: Placement): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placement));
    } catch {
        /* storage blocked: placement still applies for this session */
    }
}

/**
 * Drag-to-move and collapse for the dashboard overlay, remembered per device. After every
 * change the overlay's rectangle is published to deps.overlayRect (canvas coordinates) so the
 * physics can keep words out from under it wherever it sits. `mountKey` changes whenever the
 * overlay element is re-created (e.g. the view changes), so observers re-attach to the new node.
 */
export function useDashboardPlacement(mountKey: string) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [placement, setPlacement] = useState<Placement>(loadPlacement);
    const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: Placement; rect: DOMRect; moved: boolean } | null>(null);

    const publishRect = useCallback((retries = 20) => {
        const el = rootRef.current;
        const canvas = document.querySelector("#worldContainter canvas");
        if (!el) return;
        if (!canvas) {
            // The sketch creates its canvas after the first React layout pass; try again shortly.
            if (retries > 0) window.setTimeout(() => publishRect(retries - 1), 250);
            return;
        }
        const r = el.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        deps.overlayRect = { left: r.left - c.left, top: r.top - c.top, right: r.right - c.left, bottom: r.bottom - c.top };
    }, []);

    useLayoutEffect(() => {
        publishRect();
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => publishRect());
        observer.observe(el);
        const onResize = () => publishRect();
        window.addEventListener("resize", onResize);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", onResize);
        };
    }, [placement, publishRect, mountKey]);

    useEffect(() => () => { deps.overlayRect = undefined; }, []);

    const update = (next: Placement) => {
        setPlacement(next);
        savePlacement(next);
    };

    const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: placement, rect, moved: false };
    };

    const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d || d.pointerId !== event.pointerId) return;
        // A docked chip doesn't move; a press that travels under TAP_SLOP is still a tap.
        if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) > TAP_SLOP) d.moved = true;
        if (placement.collapsed || !d.moved) return;
        // Clamp so at least the header stays on screen.
        const dx = Math.min(Math.max(event.clientX - d.startX, -d.rect.left), window.innerWidth - d.rect.right);
        const dy = Math.min(Math.max(event.clientY - d.startY, -d.rect.top), window.innerHeight - d.rect.top - 48);
        setPlacement({ ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy });
    };

    const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d || d.pointerId !== event.pointerId) return;
        drag.current = null;
        // A tap on the header collapses the dashboard into a docked chip, and a tap on the chip
        // restores it where it was (owner, 2026-10-05: "tap to collapse … docks somewhere").
        if (!d.moved) return update({ ...placement, collapsed: !placement.collapsed });
        savePlacement(placement);
    };

    return {
        rootRef,
        collapsed: placement.collapsed,
        // Collapsed, the dashboard docks in the board's top-right corner (class DashboardCollapsed).
        style: (placement.collapsed ? {} : { transform: `translate(calc(-50% + ${placement.x}px), ${placement.y}px)` }) as React.CSSProperties,
        handleProps: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick: () => update({ ...placement, x: 0, y: 0 }) },
        toggleCollapsed: () => update({ ...placement, collapsed: !placement.collapsed }),
    };
}
