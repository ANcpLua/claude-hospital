"use client";

import React, {useCallback, useEffect, useMemo, useState} from "react";
import {AnimatePresence, motion, useMotionValue, useSpring, useTransform, useVelocity,} from "motion/react";
import {cn} from "@/lib/utils";

/**
 * CustomCursor - An interactive cursor component with smooth animations and target morphing.
 *
 * Features:
 * - Smooth spring-based cursor following
 * - Optional elastic stretch effect
 * - Morphs to wrap around target elements
 * - Optional image reveal on target hover
 * - Auto-detects target shapes (circle vs rounded rectangle)
 *
 * @example
 * ```tsx
 *
 * <CustomCursor />
 *
 *
 * <CustomCursor
 *   targets={["#button-1", ".card"]}
 *   targetPadding={10}
 * />
 *
 *
 * <CustomCursor
 *   targets={["#hero-button", "#profile-card"]}
 *   images={[
 *     "https://example.com/hero.jpg",
 *     "https://example.com/profile.jpg"
 *   ]}
 * />
 *
 *
 * <CustomCursor
 *   targets={["#with-image", "#no-image", "#another-no-image"]}
 *   images={[
 *     "https://example.com/image.jpg",
 *     undefined,
 *     undefined
 *   ]}
 *   targetPadding={8}
 * />
 * ```
 */
export interface CustomCursorProps {
    /** Size of the outer circle in pixels */
    circleSize?: number;

    /** Size of the inner dot in pixels */
    dotSize?: number;

    /** Color of the outer circle (any valid CSS color) */
    circleColor?: string;

    /** Color of the inner dot (any valid CSS color) */
    dotColor?: string;

    /** Spring stiffness for the outer circle (higher = faster) */
    circleStiffness?: number;

    /** Spring damping for the outer circle (higher = less bounce) */
    circleDamping?: number;

    /** Spring stiffness for the inner dot (higher = faster) */
    dotStiffness?: number;

    /** Spring damping for the inner dot (higher = less bounce) */
    dotDamping?: number;

    /** Border width of the outer circle in pixels */
    circleBorderWidth?: number;

    /** Additional class name for the container */
    className?: string;

    /** Additional class name for the circle */
    circleClassName?: string;

    /** Additional class name for the dot */
    dotClassName?: string;

    /** Whether to show the cursor on touch devices */
    showOnTouch?: boolean;

    /** Z-index of the cursor */
    zIndex?: number;

    /** Enable subtle elastic stretch in direction of movement */
    elastic?: boolean;

    /** CSS selectors for target elements to trigger effects on hover */
    targets?: string[];

    /** Image URLs corresponding to each target (optional - targets without images will still morph the cursor) */
    images?: (string | undefined)[];

    /** Scale amount for images when hovering targets (0-1) */
    imageScale?: number;

    /** Duration of image scale animation in seconds */
    imageAnimationDuration?: number;

    /** Additional class name for the image elements */
    imageClassName?: string;

    /** Padding between cursor and target in pixels */
    targetPadding?: number;

    /** Mix blend mode for the cursor elements */
    mixBlendMode?: React.CSSProperties["mixBlendMode"];

    /** Custom content to render inside the cursor */
    children?: React.ReactNode;
}

const CustomCursor: React.FC<CustomCursorProps> = ({
                                                       circleSize = 40,
                                                       dotSize = 6,
                                                       circleColor = "rgb(0, 0, 0)",
                                                       dotColor = "rgb(0, 0, 0)",
                                                       circleStiffness = 150,
                                                       circleDamping = 20,
                                                       dotStiffness = 300,
                                                       dotDamping = 30,
                                                       circleBorderWidth = 2,
                                                       className,
                                                       circleClassName,
                                                       dotClassName,
                                                       showOnTouch = false,
                                                       zIndex = 9999,
                                                       elastic = false,
                                                       targets = [],
                                                       images = [],
                                                       imageScale = 0.9,
                                                       imageAnimationDuration = 0.6,
                                                       imageClassName,
                                                       targetPadding = 0,
                                                       mixBlendMode,
                                                       children,
                                                   }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [hoveredTargets, setHoveredTargets] = useState<Set<number>>(new Set());
    const [targetRects, setTargetRects] = useState<Map<number, DOMRect>>(
        new Map(),
    );
    const [activeTarget, setActiveTarget] = useState<number | null>(null);

    const cursorX = useMotionValue(
        typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    );
    const cursorY = useMotionValue(
        typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    );

    const circleWidthMV = useMotionValue(circleSize);
    const circleHeightMV = useMotionValue(circleSize);
    const circleBorderRadiusMV = useMotionValue(circleSize / 2);
    const circleXMV = useMotionValue(
        typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    );
    const circleYMV = useMotionValue(
        typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    );

    const springConfig = {
        stiffness: 350,
        damping: 30,
        mass: 0.5,
    };

    const circleWidth = useSpring(circleWidthMV, springConfig);
    const circleHeight = useSpring(circleHeightMV, springConfig);
    const circleBorderRadius = useSpring(circleBorderRadiusMV, springConfig);
    const circleXSpring = useSpring(circleXMV, springConfig);
    const circleYSpring = useSpring(circleYMV, springConfig);

    const cursorFollowX = useSpring(cursorX, {
        stiffness: circleStiffness,
        damping: circleDamping,
        mass: 0.5,
    });
    const cursorFollowY = useSpring(cursorY, {
        stiffness: circleStiffness,
        damping: circleDamping,
        mass: 0.5,
    });

    const dotX = useSpring(cursorX, {
        stiffness: dotStiffness,
        damping: dotDamping,
        mass: 0.2,
    });
    const dotY = useSpring(cursorY, {
        stiffness: dotStiffness,
        damping: dotDamping,
        mass: 0.2,
    });

    const velocityX = useVelocity(cursorX);
    const velocityY = useVelocity(cursorY);

    const scaleX = useTransform(velocityX, [-1000, 0, 1000], [0.85, 1, 1.15]);
    const scaleY = useTransform(velocityY, [-1000, 0, 1000], [0.85, 1, 1.15]);

    const currentTargetData = useMemo(() => {
        if (activeTarget === null) return null;

        const rect = targetRects.get(activeTarget);
        const element = document.querySelector(
            targets[activeTarget],
        ) as HTMLElement;

        if (!rect || !element) return null;

        const borderRadiusValue =
            parseFloat(window.getComputedStyle(element).borderRadius) || 16;

        return {rect, borderRadiusValue, element};
    }, [activeTarget, targetRects, targets]);

    const isCircle = useMemo(() => {
        if (!currentTargetData) return false;
        const {rect, borderRadiusValue} = currentTargetData;
        return (
            Math.abs(rect.width - rect.height) < 1 &&
            borderRadiusValue >= rect.width / 2 - 1
        );
    }, [currentTargetData]);

    useEffect(() => {
        if (activeTarget !== null && currentTargetData) {
            const {rect, borderRadiusValue} = currentTargetData;

            const newWidth = rect.width + targetPadding * 2;
            const newHeight = rect.height + targetPadding * 2;

            circleWidthMV.set(newWidth);
            circleHeightMV.set(newHeight);

            if (isCircle) {
                circleBorderRadiusMV.set(newWidth / 2);
            } else {
                circleBorderRadiusMV.set(borderRadiusValue + targetPadding);
            }

            circleXMV.set(rect.left + rect.width / 2);
            circleYMV.set(rect.top + rect.height / 2);
        } else if (activeTarget === null) {
            circleWidthMV.set(circleSize);
            circleHeightMV.set(circleSize);
            circleBorderRadiusMV.set(circleSize / 2);

            const unsubX = cursorFollowX.on("change", (v) => circleXMV.set(v));
            const unsubY = cursorFollowY.on("change", (v) => circleYMV.set(v));

            return () => {
                unsubX();
                unsubY();
            };
        }
    }, [
        activeTarget,
        currentTargetData,
        circleSize,
        circleWidthMV,
        circleHeightMV,
        circleBorderRadiusMV,
        circleXMV,
        circleYMV,
        cursorFollowX,
        cursorFollowY,
        targetPadding,
        isCircle,
    ]);

    const updateTargetRects = useCallback(() => {
        const newRects = new Map<number, DOMRect>();
        targets.forEach((selector, index) => {
            const element = document.querySelector(selector) as HTMLElement;
            if (element) {
                newRects.set(index, element.getBoundingClientRect());
            }
        });
        setTargetRects(newRects);
    }, [targets]);

    useEffect(() => {
        if (targets && targets.length > 0) {
            requestAnimationFrame(() => {
                updateTargetRects();
            });
        }
    }, [targets, updateTargetRects]);

    useEffect(() => {
        if (!targets || targets.length === 0) return;

        const handleMouseEnter = (index: number) => () => {
            setHoveredTargets((prev) => new Set(prev).add(index));
            updateTargetRects();
            setActiveTarget(index);
        };

        const handleMouseLeave = (index: number) => () => {
            setHoveredTargets((prev) => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
            setActiveTarget(null);
        };

        const cleanupFunctions: (() => void)[] = [];

        const attachListeners = () => {
            cleanupFunctions.forEach((cleanup) => cleanup());
            cleanupFunctions.length = 0;

            targets.forEach((selector, index) => {
                const element = document.querySelector(selector) as HTMLElement;
                if (element) {
                    const enterHandler = handleMouseEnter(index);
                    const leaveHandler = handleMouseLeave(index);

                    element.addEventListener("mouseenter", enterHandler);
                    element.addEventListener("mouseleave", leaveHandler);

                    cleanupFunctions.push(() => {
                        element.removeEventListener("mouseenter", enterHandler);
                        element.removeEventListener("mouseleave", leaveHandler);
                    });
                }
            });
        };

        attachListeners();

        let debounceTimer: NodeJS.Timeout;
        const debouncedAttach = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                attachListeners();
                updateTargetRects();
            }, 200);
        };

        const observer = new MutationObserver(() => {
            debouncedAttach();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        window.addEventListener("scroll", updateTargetRects, true);
        window.addEventListener("resize", updateTargetRects);

        return () => {
            observer.disconnect();
            clearTimeout(debounceTimer);
            cleanupFunctions.forEach((cleanup) => cleanup());
            window.removeEventListener("scroll", updateTargetRects, true);
            window.removeEventListener("resize", updateTargetRects);
        };
    }, [targets, updateTargetRects]);

    useEffect(() => {
        const checkTouch = () => {
            const hasTouch =
                "ontouchstart" in window ||
                navigator.maxTouchPoints > 0 ||
                ((navigator as Navigator & { msMaxTouchPoints?: number })
                        .msMaxTouchPoints !== undefined &&
                    (navigator as Navigator & { msMaxTouchPoints?: number })
                        .msMaxTouchPoints! > 0);
            setIsTouchDevice(hasTouch);
        };

        checkTouch();

        const handleMouseMove = (e: MouseEvent) => {
            cursorX.set(e.clientX);
            cursorY.set(e.clientY);

            if (!isVisible) {
                setIsVisible(true);
            }
        };

        const handleMouseEnter = () => {
            setIsVisible(true);
        };

        const handleMouseLeave = () => {
            setIsVisible(false);
        };

        if (!isTouchDevice || showOnTouch) {
            window.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseenter", handleMouseEnter);
            document.addEventListener("mouseleave", handleMouseLeave);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseenter", handleMouseEnter);
            document.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, [cursorX, cursorY, isVisible, isTouchDevice, showOnTouch]);

    if (isTouchDevice && !showOnTouch) {
        return null;
    }

    return (
        <div
            className={cn("pointer-events-none fixed inset-0", className)}
            style={{zIndex}}
        >
            {/* Outer Circle */}
            <motion.div
                className={cn(
                    "absolute flex items-center justify-center",
                    circleClassName,
                )}
                style={{
                    width: circleWidth,
                    height: circleHeight,
                    borderRadius: circleBorderRadius,
                    left: circleXSpring,
                    top: circleYSpring,
                    x: "-50%",
                    y: "-50%",
                    border: `${circleBorderWidth}px solid ${circleColor}`,
                    opacity: isVisible ? 1 : 0,
                    scaleX: elastic && activeTarget === null ? scaleX : 1,
                    scaleY: elastic && activeTarget === null ? scaleY : 1,
                    mixBlendMode: mixBlendMode,
                    willChange: "transform, width, height, border-radius",
                }}
            >
                {children}
            </motion.div>

            {/* Inner Dot */}
            <motion.div
                className={cn("absolute rounded-full", dotClassName)}
                animate={
                    activeTarget !== null
                        ? {
                            opacity: 0,
                            scale: 0,
                        }
                        : {
                            opacity: isVisible ? 1 : 0,
                            scale: 1,
                        }
                }
                transition={{
                    duration: 0.15,
                }}
                style={{
                    width: dotSize,
                    height: dotSize,
                    left: dotX,
                    top: dotY,
                    x: "-50%",
                    y: "-50%",
                    backgroundColor: dotColor,
                    mixBlendMode: mixBlendMode,
                    willChange: "transform, opacity",
                }}
            />

            {/* Target image overlays */}
            {targets.map((selector, index) => {
                const isHovered = hoveredTargets.has(index);
                const imageUrl = images?.[index];
                const rect = targetRects.get(index);

                if (!isHovered || !rect || !imageUrl) return null;

                const element = document.querySelector(selector) as HTMLElement;
                const targetBorderRadius = element
                    ? window.getComputedStyle(element).borderRadius
                    : "0px";
                const borderRadiusValue = parseFloat(targetBorderRadius) || 0;
                const isTargetCircle =
                    Math.abs(rect.width - rect.height) < 1 &&
                    borderRadiusValue >= rect.width / 2 - 1;

                const newWidth = rect.width + targetPadding * 2;
                const cursorBorderRadius = isTargetCircle
                    ? newWidth / 2
                    : borderRadiusValue + targetPadding;

                const imageBorderRadius = isTargetCircle
                    ? (rect.width / 2) * imageScale
                    : borderRadiusValue * imageScale;

                return (
                    <AnimatePresence key={`${selector}-${index}`}>
                        {isHovered && (
                            <motion.div
                                initial={{scale: 0, opacity: 0}}
                                animate={{scale: imageScale, opacity: 1}}
                                exit={{scale: 0, opacity: 0}}
                                transition={{
                                    duration: imageAnimationDuration,
                                    ease: [0.16, 1, 0.3, 1],
                                }}
                                style={{
                                    position: "fixed",
                                    left: rect.left + rect.width / 2,
                                    top: rect.top + rect.height / 2,
                                    width: rect.width,
                                    height: rect.height,
                                    x: "-50%",
                                    y: "-50%",
                                    pointerEvents: "none",
                                    willChange: "transform, opacity",
                                    borderRadius: `${cursorBorderRadius}px`,
                                }}
                            >
                                <div
                                    className={cn(
                                        "w-full h-full bg-center bg-cover",
                                        imageClassName,
                                    )}
                                    style={{
                                        backgroundImage: `url(${imageUrl})`,
                                        borderRadius: `${imageBorderRadius}px`,
                                    }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                );
            })}
        </div>
    );
};

export default CustomCursor;
