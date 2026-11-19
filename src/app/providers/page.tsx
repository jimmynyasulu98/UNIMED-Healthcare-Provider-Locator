"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type {
  Provider,
  ProvidersResponse,
} from "../../types/provider";

const ProviderMap = dynamic(
  () => import("../../components/ProviderMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center rounded-xl bg-slate-100">
        Loading map…
      </div>
    ),
  }
);

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProviders() {
      try {
        const response = await fetch("/api/providers", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `Unable to load providers (${response.status}).`
          );
        }

        const data: ProvidersResponse = await response.json();
        setProviders(data.providers);
      } catch (error) {
        if (controller.signal.aborted) return;

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load providers."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadProviders();

    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Academic prototype
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            UNIMED Provider Locator
          </h1>

          <p className="mt-2 text-slate-600">
            Explore healthcare providers and their services
            in Zomba.
          </p>
        </header>

        {loading ? (
          <p role="status">Loading providers…</p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-red-800 px-4 py-2 text-white"
            >
              Try again
            </button>
          </div>
        ) : providers.length === 0 ? (
          <p>No providers with coordinates are available.</p>
        ) : (
          <>
            <p className="mb-4 font-medium">
              {providers.length} providers available
            </p>

            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
              <aside
                aria-label="Provider list"
                className="max-h-[600px] space-y-3 overflow-y-auto pr-1"
              >
                {providers.map((provider) => (
                  <article
                    key={provider.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <h2 className="font-semibold">
                      {provider.name}
                    </h2>

                    <p className="mt-1 text-sm text-blue-700">
                      {provider.category ??
                        "Category not specified"}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      {provider.services.length
                        ? provider.services.join(", ")
                        : "Services not specified"}
                    </p>
                  </article>
                ))}
              </aside>

              <section
                aria-label="Provider map"
                className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <ProviderMap providers={providers} />
              </section>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              Click a blue map marker to view provider details.
              Provider information is for demonstration purposes.
            </p>
          </>
        )}
      </div>
    </main>
  );
}