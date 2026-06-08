import { EnumAssistant } from "@/components/EnumAssistant";

export const metadata = {
  title: "SQLMAP ⟁ ENUMERATION",
  description: "Database enumeration — discover DBs, tables, columns and dump data",
  robots: { index: false, follow: false },
};

export default function EnumPage(): React.ReactElement {
  return <EnumAssistant />;
}
