import { useParams } from "react-router-dom";
import { PageShell } from "../components/ui/PageShell";

export function RentMonth() {
  const { monthKey } = useParams<{ monthKey: string }>();

  return (
    <PageShell title={`Rent: ${monthKey ?? "Unknown Month"}`}>
      <p>
        This will show the full dues breakdown table for{" "}
        <span className="font-mono">{monthKey}</span>.
      </p>
    </PageShell>
  );
}


