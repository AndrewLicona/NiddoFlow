import { redirect } from "next/navigation";

export default function ShoppingPage() {
    redirect("/resources?section=needs");
}
