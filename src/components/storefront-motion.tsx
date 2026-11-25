"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "./storefront-motion.css";

const excludedRoutes = new Set([
  "admin", "api", "account", "cart", "checkout",
  "payment", "payments", "orders", "login",
  "register", "wishlist", "maintenance",
  "forgot-password", "reset-password",
  "resend-verification", "verify-email",
]);

export default function StorefrontMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const route = pathname.split("/").filter(Boolean)[0] || "";

    if (excludedRoutes.has(route)) return;
    if (!("IntersectionObserver" in window)) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (reduced.matches) return;

    const mobile = window.matchMedia("(max-width: 767px)").matches;

    const seen = new WeakSet<Element>();
    const running = new Set<Element>();
    const timers = new Map<Element, number>();

    const selector = route === ""
      ? "main > section"
      : route === "contact" || route === "contact-info"
      ? "main section, .sk-connect-store"
      : route === "about"
      ? "main section"
      : route === "product"
      ? "main > section, .skpd-v5-card"
      : ".skshop-collection-card, .skshop-ref-card, main > section";

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const node = entry.target;

        observer.unobserve(node);

        if (seen.has(node)) continue;
        seen.add(node);

        if (reduced.matches) continue;
        if (document.visibilityState !== "visible") continue;

        // Limit simultaneous animations on budget mobiles.
        if (running.size >= (mobile ? 3 : 6)) continue;

        running.add(node);
        node.classList.add("sk-motion-reveal");

        const timer = window.setTimeout(() => {
          node.classList.remove("sk-motion-reveal");
          running.delete(node);
          timers.delete(node);
        }, 650);

        timers.set(node, timer);
      }
    }, { threshold: 0.04 });

    const scan = () => {
      document.querySelectorAll(selector).forEach(node => {
        if (seen.has(node)) return;

        const rect = node.getBoundingClientRect();

        if (rect.top < window.innerHeight) {
          seen.add(node);
          return;
        }

        observer.observe(node);
      });
    };

    let frame = requestAnimationFrame(scan);

    // Support newly rendered catalog results.
    const root = document.querySelector("main");

    const changes = new MutationObserver(records => {
      if (!records.some(record => record.addedNodes.length)) return;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });

    if (root) {
      changes.observe(root, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      changes.disconnect();

      timers.forEach(timer => window.clearTimeout(timer));

      running.forEach(node => {
        node.classList.remove("sk-motion-reveal");
      });
    };
  }, [pathname]);

  return null;
}
