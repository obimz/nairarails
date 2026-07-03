import React from "react";
import { useNavigate } from "react-router-dom";

const HeroNetworkScene = React.lazy(async () => {
  const module = await import("../components/HeroNetworkScene.js");
  return { default: module.HeroNetworkScene };
});

function useShouldRender3D() {
  const getInitial = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.innerWidth >= 768 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  const [shouldRender3D, setShouldRender3D] = React.useState<boolean>(getInitial);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setShouldRender3D(window.innerWidth >= 768 && !mediaQuery.matches);
    };

    update();

    window.addEventListener("resize", update);
    mediaQuery.addEventListener("change", update);

    return () => {
      window.removeEventListener("resize", update);
      mediaQuery.removeEventListener("change", update);
    };
  }, []);

  return shouldRender3D;
}

function StaticNetworkFallback() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-white via-green-50 to-gray-100">
      <div className="mx-auto grid h-full max-w-3xl grid-cols-2 gap-3 px-6 py-10 sm:grid-cols-4 sm:items-center">
        {[
          "Wema",
          "GTB",
          "Access",
          "Nomba",
        ].map((bank) => (
          <div
            key={bank}
            className="flex items-center justify-center rounded-xl border border-green-100 bg-white/85 px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm"
          >
            {bank}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  const shouldRender3D = useShouldRender3D();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative isolate overflow-hidden border-b border-gray-200">
        {shouldRender3D ? (
          <React.Suspense
            fallback={(
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white via-gray-50 to-green-50/60 text-sm text-gray-500">
                Loading payment network...
              </div>
            )}
          >
            <HeroNetworkScene />
          </React.Suspense>
        ) : (
          <StaticNetworkFallback />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/40" />

        <div className="relative z-10 mx-auto flex min-h-[70vh] w-full max-w-6xl items-center px-6 py-16 sm:py-24">
          <div className="max-w-2xl rounded-2xl border border-white/70 bg-white/85 p-7 shadow-lg backdrop-blur-sm sm:p-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-green-700">
              NairaRails
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Payment rails built for order-level certainty.
            </h1>
            <p className="mt-5 text-base text-gray-600 sm:text-lg">
              Provision per-order virtual accounts, receive bank transfers instantly, and auto-reconcile every payment flow in one API-first infrastructure layer.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => {
                  navigate("/dashboard");
                }}
                className="btn-primary pointer-events-auto"
              >
                Get API Access
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
