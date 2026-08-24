import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/driver", statusCode: 302 });
  },
  component: IndexRedirectComponent,
});

function IndexRedirectComponent() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/driver", replace: true });
  }, [navigate]);

  return null;
}
