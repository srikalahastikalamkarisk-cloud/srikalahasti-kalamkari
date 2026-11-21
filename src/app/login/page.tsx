import type {Metadata} from "next";
import CustomerAuth from "@/components/customer-auth";
export const metadata:Metadata={title:"Customer login | Srikalahasti Kalamkari"};
export default function Page(){return <CustomerAuth mode="login"/>}
