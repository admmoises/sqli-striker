import { ControlPanel } from "@/components/ControlPanel";

/**
 * Task #2 main page. Thin server shell — the entire interactive operator
 * surface is composed inside the ControlPanel client component so state and
 * event handlers live in one tree.
 */
export default function Home(): React.ReactElement {
  return <ControlPanel />;
}
