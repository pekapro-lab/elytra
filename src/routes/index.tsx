import { createFileRoute } from "@tanstack/react-router";
import { Microcosmos } from "@/components/microcosmos";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <Microcosmos />;
}
