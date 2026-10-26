"use client";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildLiveEnv, type LiveBoot } from "./adapters/live";
import { workspaceCall } from "./server/actions";
import { openOf, viewOf } from "./routes";

// Mounts the workspace once for the visit and keeps it in step with the
// address: moving between sections is the workspace's own navigation, the
// address follows it, and the back button and links land in the right place.
function Host({ boot }: { boot: LiveBoot }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const engine = useRef<any>(null);
  const first = useRef({ view: viewOf(pathname), open: openOf(search, viewOf(pathname)) });

  useEffect(() => {
    let cancelled = false;
    import("./engine").then(({ startWorkspace }) => {
      if (cancelled) return;
      const env: any = {
        ...buildLiveEnv(boot, first.current.view),
        call: workspaceCall,
        open: first.current.open,
        navigate: (url: string) => {
          if (url !== window.location.pathname) router.push(url);
        },
      };
      engine.current = startWorkspace(env);
      if (first.current.open) window.history.replaceState(null, "", window.location.pathname);
    });
    return () => {
      cancelled = true;
      engine.current?.();
      engine.current = null;
      const app = document.getElementById("app");
      if (app) app.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!engine.current) return;
    const view = viewOf(pathname);
    const open = openOf(search, view);
    engine.current.route(view, open);
    if (open) window.history.replaceState(null, "", window.location.pathname);
  }, [pathname, search]);

  return null;
}

export default function WorkspaceHost({ boot }: { boot: LiveBoot }) {
  return (
    <Suspense fallback={null}>
      <Host boot={boot} />
    </Suspense>
  );
}
