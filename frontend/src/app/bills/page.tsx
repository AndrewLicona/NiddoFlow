import { redirect } from "next/navigation";

export default function BillsPage() {
    redirect("/resources?section=payments");
}
